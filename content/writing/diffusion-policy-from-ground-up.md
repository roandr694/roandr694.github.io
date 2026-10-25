I want to understand what a diffusion policy actually computes when it receives an image of a robot's workspace. The phrase “generate actions by removing noise” sounds strange at first. A motor needs a command with units and a deadline. How does an operation on random numbers produce one?

I find it useful to start with demonstrations, then work through the distribution being learned, and only then look at the denoising equations. The [Diffusion Policy paper by Chi and colleagues](https://arxiv.org/abs/2303.04137) applies conditional diffusion to robot action sequences and combines that prediction with repeated observation and replanning. These notes build up a small example of that idea.

<figure class="video-figure"><iframe src="https://www.youtube-nocookie.com/embed/WLH3Cr_HL-c" title="Diffusion Policy — demonstration video by the paper authors" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="width:100%;aspect-ratio:16/9;border:0;border-radius:4px"></iframe><figcaption>The authors’ Diffusion Policy video. Real robot experiments and benchmark demonstrations belong to the research team; the numerical examples and illustrations below are explanatory toys. More demonstrations are on the <a href="https://diffusion-policy.cs.columbia.edu/">project page</a>.</figcaption></figure>

## Starting from demonstrations

A demonstration records someone completing a task. For a robot arm, that might mean camera images, joint measurements, and commands recorded while an operator controls the gripper. The command might specify a desired end-effector pose, joint positions, or velocities. The end effector is the part interacting with the world, such as the gripper.

Imitation learning uses these examples to learn behavior. Behavior cloning is a common version: train a policy to produce commands consistent with the demonstrated commands for the corresponding observations. The original Diffusion Policy formulation fits within this setting. Its basic training signal comes from demonstrated actions.

That connects to my [RL notes](/writing/reinforcement-learning-for-robots/), but the source of supervision differs. In RL, outcomes and rewards guide policy improvement. Here I already have examples of what an operator did. Adding diffusion changes the model of those actions; it does not, by itself, introduce a reward function or trial-and-error learning on hardware.

Let $o_t$ denote an observation at robot time $t$. I can include recent observations in a context $c_t$, so the model has information about motion as well as appearance. A conditional action distribution is written

$$
p_\theta(A_t\mid c_t).
$$

The vertical bar means “given.” The parameters $\theta$ are the adjustable numbers in the model. The expression describes possible action sequences under the current context, including how likely different sequences are.

## Why an average action can be a poor choice

Suppose the gripper needs to move around an obstacle. The demonstrations contain two reasonable strategies: pass on its left or pass on its right. For a deliberately small example, imagine the lateral command at a particular moment is $-1$ in half the examples and $+1$ in the other half, under the same observed context.

A deterministic predictor trained with squared error chooses a value $u$ to minimize

$$
\mathcal L(u)=\tfrac12(u+1)^2+\tfrac12(u-1)^2=u^2+1.
$$

The minimum is at $u=0$. That is the average of the demonstrated commands. If the obstacle is directly ahead, the average can correspond to driving into it. The arithmetic is specific to this teaching example; an actual demonstration dataset may distinguish the strategies through history or other context.

<figure><img src="/images/writing/diffusion-policy/modes.svg" alt="Two-peaked toy distribution of demonstrated lateral commands near minus one and plus one, with their mean at zero between the peaks" loading="lazy"><figcaption>An analytical two-Gaussian toy distribution. The two peaks represent alternatives under a fixed context. The mean falls between them. This plot is not measured robot data.</figcaption></figure>

A mode is a peak in a probability distribution. A multimodal distribution has several peaks, so it can represent more than one plausible choice. Here “mode” refers to alternative actions, rather than camera and language input modalities.

A distribution model can sample one of the alternatives. Diffusion is one way to build such a model. Mixture models and other generative approaches can also represent alternatives; the averaging issue belongs to the simple deterministic squared-error setup, rather than to all behavior cloning.

## Predicting a sequence

An individual action might be a vector. For example,

$$
a_t=[\Delta x_t,\Delta y_t,\Delta z_t]
$$

could specify a small displacement of the gripper in a chosen coordinate frame. A real interface also needs decisions about orientation and gripper opening. The vector is meaningful only once I know its units, coordinate frame, and how the low-level controller interprets it.

I can stack future actions into a chunk:

$$
A_t=[a_t,a_{t+1},\ldots,a_{t+H-1}]\in\mathbb R^{H\times d}.
$$

Here $H$ is the number of predicted robot steps and $d$ is the number of components per action. Eight future three-component commands contain 24 numbers. The notation $\mathbb R^{H\times d}$ just says that these real-valued numbers form a table with $H$ rows and $d$ columns.

Learning the chunk jointly gives the model a way to represent relationships between successive commands. Going left at one step and then immediately switching to an incompatible right-hand strategy can be different from following a coherent route. Sequence prediction can help represent that relationship, although it does not guarantee smooth or collision-free execution.

## Two clocks in the same calculation

There are two different indices to keep straight:

| Index | What advances | What it means physically |
|---|---|---|
| $t$ | Robot control time | Observations arrive and commands are executed |
| $k$ | Diffusion noise level | A candidate command sequence is refined inside the computer |

For the math below, I call a clean, normalized demonstration chunk $x_0$. Adding noise produces $x_1,\ldots,x_K$. Generating a new chunk runs in the opposite direction, from $x_K$ toward $x_0$.

The subscript zero here labels the clean noise level. It is separate from the robot's starting time. Each $x_k$ contains a candidate for the whole chunk, rather than one command at robot timestep $k$.

<figure><img src="/images/writing/diffusion-policy/denoising-illustration.png" alt="Three conceptual overhead views progressing from scattered action waypoints to a refined route around the left of an obstacle" loading="lazy"><figcaption>Generated conceptual illustration of candidate refinement. These panels represent computations on a proposed sequence; the robot does not physically execute the noisy intermediate candidates. A sampled sequence is not guaranteed to avoid an obstacle as drawn here.</figcaption></figure>

## Adding noise during training

A Gaussian distribution is the familiar bell-shaped distribution. A standard Gaussian has mean zero and variance one. Variance measures average squared distance from the mean; its square root is the standard deviation, which gives a scale for the spread.

For a vector, $\epsilon\sim\mathcal N(0,I)$ means each component is sampled independently from a standard Gaussian. The identity matrix $I$ specifies unit variance per component and zero covariance between different components. These numbers initially carry no knowledge of the task.

Before adding noise, I normalize the action coordinates. A translation in meters and an angle in radians can have very different numerical ranges. One possible normalization is

$$
\widetilde a_j=\frac{a_j-\mu_j}{s_j},
$$

where $\mu_j$ and $s_j>0$ are a center and scale fitted using training data for component $j$. Other implementations use range-based scaling. Whichever convention I choose, training and deployment need the same transformation, and the final commands need the inverse transformation.

Diffusion here describes a sequence of random perturbations to the data. In a standard denoising diffusion probabilistic model, or DDPM, I choose a noise schedule $\beta_1,\ldots,\beta_K$ and define

$$
\alpha_k=1-\beta_k,
\qquad
\bar\alpha_k=\prod_{i=1}^{k}\alpha_i.
$$

A schedule specifies how much noise is introduced at each level. The product symbol means multiplying all the $\alpha_i$ values up to level $k$. I can sample a noisy version of a clean chunk directly:

$$
x_k=\sqrt{\bar\alpha_k}\,x_0+
\sqrt{1-\bar\alpha_k}\,\epsilon.
$$

The first term retains part of the demonstration. The second adds random perturbations. When $\bar\alpha_k$ is close to one, much of the clean signal remains. When it is close to zero, the result is mostly noise. A sufficiently strong final corruption makes the distribution close to a standard Gaussian, which gives generation a convenient starting distribution.

For one normalized coordinate, take $x_0=0.8$, $\bar\alpha_k=0.64$, and a sampled noise value $\epsilon=-0.5$. Then

$$
x_k=0.8(0.8)+0.6(-0.5)=0.34.
$$

The factors $0.8$ and $0.6$ are square roots. This example makes it clear why simply subtracting $-0.5$ from $0.34$ would not recover $0.8$: the clean signal and the noise have both been scaled.

<figure><img src="/images/writing/diffusion-policy/noise-levels.svg" alt="A fixed toy action sequence shown at three increasing noise levels, with its original clean sequence drawn for comparison" loading="lazy"><figcaption>Calculated forward corruption of a hand-defined normalized action sequence using the equation above and a fixed noise draw. Columns are future robot steps; the panels use different diffusion noise levels. No policy was trained to produce this plot.</figcaption></figure>

The [DDPM paper by Ho, Jain and Abbeel](https://arxiv.org/abs/2006.11239) develops this formulation. I am using its common variance-preserving notation here; diffusion papers sometimes package the coefficients differently.

## What the neural network learns

The model receives the noisy chunk $x_k$, its noise level $k$, and the observation context $c_t$. In the noise-prediction parameterization, it returns

$$
\hat\epsilon=\epsilon_\theta(x_k,k,c_t).
$$

The hat means an estimate. The output has the same shape as the chunk: it predicts a noise value for each action component at each future step. During training I know the particular noise I added, so I can compare prediction with target:

$$
\mathcal L(\theta)=
\mathbb E_{(c_t,x_0),k,\epsilon}
\left[\left\|\epsilon-
\epsilon_\theta(x_k,k,c_t)\right\|_2^2\right].
$$

The squared norm means summing squared component errors. Implementations may average over components as well. The expectation averages over training examples, sampled noise levels, and newly drawn noise. A minibatch approximates that average with a small collection of samples; backpropagation computes how changing the network weights would change the loss.

One training update can sample a noise level directly using the forward formula. It need not run an entire reverse chain for every example. Across updates, the model practices denoising at many levels.

The exact added noise is generally ambiguous from a noisy input. Squared-error training learns a conditional average noise prediction under the training distribution. That does not contradict the earlier problem with average actions: this prediction is conditioned on both the noisy candidate and its noise level. An iterative sampling process uses it to construct a distribution of complete outputs, rather than returning the unconditional average demonstrated command.

## Where the camera image enters

For visual control, an image encoder converts pixels into features. An embedding is a vector of learned numbers representing information extracted from an input. A small illustrative vector such as $[0.2,-0.7,1.1]$ is just a list of coordinates; those coordinates do not automatically mean “cup,” “left,” and “distance.” Training determines how their combinations become useful.

The context can combine image embeddings, recent joint measurements, and gripper state. Conditioning means letting that information influence the predicted noise at every refinement step. Changing the observed object position should change which action sequences the model favors.

A denoiser can use a temporal convolutional network, which combines neighboring positions in the sequence, or a transformer, which mixes information using attention. Attention computes input-dependent weights for combining representations. The architecture determines how the context, noise level, and action candidates interact; the diffusion objective does not require language input.

This relates to the [VLA notes](/writing/vla-from-ground-up/). A VLA describes a model connecting vision, language, and action. A diffusion action head describes how actions can be generated. A larger model could combine both ideas, while a vision-conditioned diffusion policy can work without a language instruction.

## Generating a fresh chunk

At deployment, I have the current context but no demonstrated future chunk to corrupt. I start by drawing $x_K\sim\mathcal N(0,I)$, then repeatedly apply the learned reverse process.

One standard noise-prediction DDPM sampling update is

$$
x_{k-1}=\frac{1}{\sqrt{\alpha_k}}
\left(x_k-
\frac{\beta_k}{\sqrt{1-\bar\alpha_k}}
\epsilon_\theta(x_k,k,c_t)\right)
+\sigma_k z,
$$

where $z\sim\mathcal N(0,I)$ is a fresh draw and $\sigma_k$ controls the reverse-step noise. A common fixed-variance choice is

$$
\sigma_k^2=\widetilde\beta_k
=\beta_k\frac{1-\bar\alpha_{k-1}}{1-\bar\alpha_k},
\qquad \bar\alpha_0=1.
$$

At the final step this choice gives zero added noise. Other sampler and variance conventions exist, so the coefficients need to match the chosen implementation.

Reading the update from the inside outward helps: subtract a schedule-scaled estimate of the noise, rescale the candidate, then add the reverse process's chosen amount of randomness. Repeat at decreasing noise levels. These are inference operations with fixed learned weights; they are not gradient updates to the model parameters.

The original clean chunk is unavailable during generation, so the model cannot literally undo one known historical corruption. It uses the distribution learned from many examples to turn a fresh random seed into a new sample. Different seeds can produce different alternatives for the same observation.

<details><summary>Play a toy reverse-diffusion animation</summary><img src="/images/writing/diffusion-policy/reverse-mixture.gif" alt="Histogram of one-dimensional samples evolving from roughly Gaussian noise toward two separate peaks under an analytic toy reverse sampler"></details>

The animation uses an analytically known two-Gaussian distribution and its exact noise predictor inside a finite-step DDPM sampler. It illustrates distribution sampling without training a network. Its peaks are scalar alternatives, not robot trajectories, and finite-step sampling is approximate.

## From prediction to executed commands

After sampling, I undo normalization and interpret the numbers using the chosen robot interface. The intermediate noisy chunks stay in memory. Only the selected final commands are candidates for execution through the controller.

Receding-horizon execution means predicting ahead, executing a shorter prefix, observing again, and predicting a new chunk. In my simplified indexing, a prediction has $H$ future actions and I execute $h\leq H$ of them. The original method distinguishes observation, prediction, and execution horizons; exact window alignment must follow the implementation.

Suppose I predict eight commands at 10 Hz but execute only two before replanning. The prediction spans eight control intervals, or $0.8$ seconds. The executed prefix spans $0.2$ seconds. After that prefix, a new observation may reveal that the object moved or the grasp slipped. These numbers are illustrative choices, rather than settings claimed for the paper's experiments.

<figure><img src="/images/writing/diffusion-policy/receding-horizon.svg" alt="Two prediction windows of eight actions overlap in robot time, with only the first two commands of each window selected before replanning" loading="lazy"><figcaption>An idealized 10 Hz timeline with instantaneous inference. The lighter part of each window is a predicted future that will be replaced when the controller replans. Actual inference delay has to be included in the execution schedule.</figcaption></figure>

A longer executed prefix reduces how often I must sample a chunk, but leaves the robot following older information for longer. A shorter prefix allows more frequent feedback, provided inference and sensing finish in time. Even with repeated replanning, a prefix can be open-loop with respect to new camera observations while the low-level controller continues using encoder feedback.

This resembles the execution pattern of model predictive control. Standard diffusion-policy inference, however, samples from a learned action distribution; it need not optimize an explicit dynamics model and task cost at each replanning step.

## Computation is part of the controller

If the denoiser takes $\ell$ seconds per call and I make $K$ calls, a rough sequential cost is $K\ell$, before accounting for image encoding, transfers, and scheduling. The model's nominal action rate does not tell me whether it meets the control deadline.

For a numerical budget, 20 calls at 3 ms per call already take 60 ms. At 10 Hz, a control interval is 100 ms. The remaining 40 ms has to cover everything else in that interval if I require synchronous updates. These are budget calculations, not benchmark measurements.

[DDIM, by Song, Meng and Ermon](https://arxiv.org/abs/2010.02502), provides a related sampling formulation that can use fewer inference steps. Some configurations make the reverse trajectory deterministic once the initial noise and context are fixed. Changing the sampler is more involved than deleting arbitrary steps from the DDPM equation: the update and timestep schedule must be consistent. The latency–quality tradeoff needs measurement on the actual task and hardware.

## What the data still has to provide

A flexible action distribution does not supply missing demonstrations. If the dataset contains only successful grasps from one camera angle and one object arrangement, I should not assume the policy will recover from a dropped object or a blocked camera.

Closed-loop execution can visit observations that were rare or absent in the demonstration dataset. An early positioning error changes the next image, which changes the next prediction. This accumulation is one reason a low held-out denoising loss is insufficient evidence of reliable robot behavior.

I would separate training and evaluation by complete episodes, rather than randomly mixing adjacent windows from the same recording. Nearby windows share most of their frames and actions. Keeping them on opposite sides of a split can make an evaluation look more independent than it is. Normalization statistics also belong to the training split.

The action representation deserves the same attention as the network. Absolute positions and relative displacements create different error patterns. Coordinate frames, rotation representations, image–action synchronization, and controller delay determine what the recorded commands mean. An otherwise correct model can learn the wrong temporal relationship from misaligned data.

Finally, a plausible sampled command is not a feasibility certificate. Joint limits, collision handling, and command-rate limits still belong to the execution system. I would evaluate complete task success, failure behavior, and timing across the conditions I care about, keeping those results separate from the training loss.

The part I want to carry forward is the sequence of operations: use demonstrations to learn conditional denoising, sample a whole action chunk from noise, then execute a short portion and observe again. That makes the computational role of diffusion concrete enough to compare with a direct policy, an RL policy, or an action head inside a VLA.
