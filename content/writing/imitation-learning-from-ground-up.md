Suppose I can teleoperate a robot through a task, but writing a controller for every part of that task would be difficult. I can record what the robot sees and which commands I send. Imitation learning starts from those examples and asks how to turn them into a policy that can act on its own.

The useful part is that the demonstrations already contain decisions: where to approach an object, when to close the gripper, and how to move after contact. The difficult part appears when the learned policy makes its first small mistake. Its next observation comes from the position it actually reached, which may be different from anything in the recording.

I want to work through both parts: how the supervised learning problem is constructed, and why controlling a system introduces a problem beyond prediction on a fixed dataset.

<figure><video controls playsinline preload="none" style="width:100%;aspect-ratio:16/9;object-fit:contain;border-radius:4px" aria-label="robomimic project overview by the research authors"><source src="https://robomimic.github.io/assets/robomimic_video.mp4" type="video/mp4">Watch the <a href="https://robomimic.github.io/">robomimic project overview</a>.</video><figcaption>The research team’s <a href="https://robomimic.github.io/">robomimic</a> overview, showing robot learning from demonstrations. This is external research footage. The scalar simulations and drawings below are separate teaching examples.</figcaption></figure>

## What a demonstration contains

A demonstration is usually a time-aligned recording. At each control step $t$, I want the observation available before choosing the action, the command that was chosen, and enough timing information to interpret the pair.

For a manipulation task, that might look like this:

| Recorded quantity | Example | Why it matters |
|---|---|---|
| Images | Workspace and wrist cameras | Object location, appearance, contact cues |
| Proprioception | Joint positions and velocities | The robot's measurements of its own configuration and motion |
| Action | Desired joint positions or gripper displacement | The command the policy should learn to produce |
| Timing and episode boundaries | Timestamps, resets, task completion | Correct alignment and separation of complete attempts |

Teleoperation means a person controls the robot remotely through an interface. The recorded action could be the command after interface scaling or filtering, rather than the operator's raw input. I need to know which one the deployment controller expects.

A commanded target and a measured result also differ. A desired gripper position is not automatically the position reached one frame later. Actuator dynamics, contact, and delays sit between them. Replacing action labels with future measured positions changes the learning problem.

A video of a person performing a task supplies observations but may not supply robot-compatible actions. Learning from observation introduces additional questions about correspondence between bodies, motion, and controls. I will assume paired robot observations and action labels for the behavior-cloning equations here.

## From a recording to training examples

A policy maps available information to an action. I write a deterministic policy as $f_\theta(c_t)$, where $\theta$ contains its adjustable parameters and $c_t$ is the context at time $t$.

Context can be one observation or a history of observations and previous actions. A single image may leave out velocity or whether the gripper has just closed. A history provides extra evidence; a recurrent network can compress earlier information into an internal memory. Neither guarantees that hidden physical information becomes observable.

Let $a_t^E$ denote the expert's action. Here “expert” means the source of the demonstration labels; it could be a person, a planner, or an existing controller. It does not imply that every action is optimal.

I can construct a dataset

$$
\mathcal D=\{(c_i,a_i^E)\}_{i=1}^{N}.
$$

The index $i$ runs over training examples, possibly from many episodes. An episode is one complete attempt from a reset until an ending condition. If I use overlapping history windows, neighboring examples share observations. A thousand adjacent frames therefore contain a different kind of information from a thousand independently varied attempts.

## Behavior cloning as supervised learning

Behavior cloning fits a policy to the demonstrated actions. For continuous commands, one simple objective is mean squared error:

$$
\mathcal L_{\rm BC}(\theta)
=\frac{1}{N}\sum_{i=1}^{N}
\left\|f_\theta(c_i)-a_i^E\right\|_2^2.
$$

The norm means summing squared errors across action components. The outer average combines examples. Some implementations additionally average over components or apply weights.

For a two-component teaching example, suppose the demonstrated command is $[0.10,-0.20]$ and the prediction is $[0.08,-0.15]$, both expressed in the same normalized coordinates. The squared error for that sample is

$$
(0.08-0.10)^2+(-0.15+0.20)^2
=0.0004+0.0025=0.0029.
$$

A gradient describes how this loss changes as each model parameter changes. Backpropagation computes those derivatives, and an optimizer adjusts the parameters to reduce the training loss. A minibatch is a subset of examples used to estimate an update.

This arithmetic becomes misleading if one component is measured in meters and another has a numerical range hundreds of times larger. Scaling the action coordinates, fitting normalization on training data, and using the same inverse transform at deployment are part of defining the objective.

## Learning probabilities instead of one command

For a discrete action, such as choosing between open and close, the policy can output probabilities. More generally, I can write a stochastic policy $\pi_\theta(a\mid c)$: a distribution over actions given context.

Maximum likelihood trains the model to assign high likelihood to the demonstrated actions. A common loss is negative log-likelihood:

$$
\mathcal L_{\rm NLL}(\theta)
=-\frac{1}{N}\sum_{i=1}^{N}
\log\pi_\theta(a_i^E\mid c_i).
$$

For a discrete demonstrated choice, assigning probability $0.8$ gives loss $-\log(0.8)\approx0.223$. Assigning probability $0.2$ gives about $1.609$. These use natural logarithms. The second prediction receives a larger penalty because it assigns less probability to the recorded choice.

For continuous commands, $\pi$ represents a probability density. Probability applies to a region of command space, rather than an exact real-valued point. If I assume a Gaussian density with a fixed, equal variance in every normalized coordinate, minimizing its negative log-likelihood over the predicted mean is equivalent to minimizing squared error, up to a positive scale and an additive constant. Learning the variance or changing the density model changes the objective.

The distribution matters when several choices are reasonable. If half the demonstrations go left around an object and half go right under the same context, a single squared-error prediction can land between them. My [Diffusion Policy notes](/writing/diffusion-policy-from-ground-up/) work through that example and one approach to representing the alternatives. Behavior cloning describes the source of supervision; diffusion describes one possible action model.

## The robot changes its own next input

During training, an example usually comes from an expert's recording. During execution, the policy chooses a command, the world changes, and the next input reflects that change.

A small positioning error can put the gripper slightly beside the object. The next image now shows an unfamiliar alignment. The policy may make another poor choice there, increasing the offset. Low average error on expert images does not tell me how the policy behaves after this deviation.

<figure><img src="/images/writing/imitation-learning/drift-and-correction.png" alt="Conceptual comparison of robot configurations along a demonstrated corridor and an unfamiliar configuration after drift, with an expert correction toward the corridor" loading="lazy"><figcaption>Generated conceptual illustration. The green corridor represents a narrow range of demonstrated configurations. The correction marks additional supervision that would be useful after leaving that range; it is not a measured robot rollout.</figcaption></figure>

Covariate shift means the distribution of inputs changes between training and use. In imitation learning, that change can be caused by the learned policy itself. Sensor changes and new objects can also cause a shift, but here the feedback loop alone is enough.

I can express the distinction using $d_E(c)$ for the context distribution encountered by the expert and $d_\pi(c)$ for the distribution encountered by the learner. For a finite task, these can average over the control steps in an episode. The action disagreement measured on the expert's contexts is

$$
\mathbb E_{c\sim d_E}
\left[\ell(\pi(c),\pi_E(c))\right],
$$

while disagreement along the learner's own execution involves

$$
\mathbb E_{c\sim d_\pi}
\left[\ell(\pi(c),\pi_E(c))\right].
$$

Here $\ell$ is a chosen action loss, $\pi_E$ is a deterministic expert for this notation, and $\mathbb E$ means an average weighted by the distribution. The contexts being averaged have changed. Evaluating the second expression also requires knowing what the expert would do at those learner-visited contexts.

## How a small error can matter over a long task

Consider an intentionally simplified model: each of $T$ decisions independently has probability $\epsilon$ of a deviation. Then

$$
P(\text{at least one deviation})
=1-(1-\epsilon)^T.
$$

With $\epsilon=0.01$ and $T=100$, this is about $0.634$. Even a small per-decision probability can produce frequent deviations over a sequence.

<figure><img src="/images/writing/imitation-learning/deviation-probability.svg" alt="Analytical probability of at least one deviation rises with the number of decisions under independent per-decision probabilities of 0.5, 1, and 2 percent" loading="lazy"><figcaption>The independent-decision calculation above. This is not a prediction of task failure or a measured behavior-cloning error rate.</figcaption></figure>

One deviation does not necessarily cause failure. A controller may recover immediately, and many differences from a demonstration are harmless. Real errors can also be correlated, and their probabilities can change after a deviation. The calculation is useful for thinking about task length, but it does not capture the full compounding-error problem.

The harder issue is what happens next: leaving the demonstrated region can make later decisions much less reliable. That is why collecting recovery behavior can be valuable even when clean demonstrations already look consistent.

## Asking the expert about the learner's situations

DAgger, short for Dataset Aggregation, addresses this mismatch by collecting expert labels at contexts encountered during learner-influenced execution. The [original paper by Ross, Gordon and Bagnell](https://proceedings.mlr.press/v15/ross11a.html) gives the algorithm and its analysis.

The central loop is to roll out the current policy, ask the expert which action to take at the visited contexts, add those labeled examples to the existing dataset, and refit. With an accumulated dataset $\mathcal D_k$, one update is

$$
\mathcal D_{k+1}
=\mathcal D_k\cup
\{(c,\pi_E(c)):c\text{ visited in round }k\}.
$$

The union means retaining earlier examples while adding the new ones. At a learner-visited context, the target is the expert's action, which may differ from the action the learner actually executed. Simply recording the learner's commands and treating them as expert labels would reinforce its own choices.

A compact version of the procedure is:

```text
D = initial expert demonstrations
fit learner on D
repeat:
    collect contexts using a learner-influenced rollout
    query expert actions at those contexts
    append the expert-labeled examples to D
    refit learner on accumulated D
select a policy using separate rollout evaluation
```

Early rounds can mix expert and learner control. A mixing probability specifies how often the expert chooses the executed command, and can decrease as training proceeds. Querying a label and choosing who controls the robot are separate decisions.

## A small recovery simulation

I can make the coverage problem visible without a neural network. Let $e_t$ be a scalar lateral offset and let the dynamics be

$$
e_{t+1}=e_t+u_t+0.03.
$$

The constant $0.03$ is an imposed disturbance per step. I define an expert feedback rule $u_E(e)=-0.6e$. The initial training set has seven equally spaced offsets between $-0.03$ and $+0.03$, labeled by this expert.

My fitted policy uses nearest-neighbor prediction: find the closest stored offset and return its action label. This deliberately simple model makes its behavior outside the training range easy to inspect. For any offset larger than $0.03$, the closest initial example supplies $u=-0.018$. The disturbance is larger than that correction, so the offset keeps increasing by $0.012$ per step.

I then collect a 60-step rollout starting at zero, ask the analytic expert to label every visited offset, append those pairs, and refit the same predictor. I evaluate both fitted policies from the same reset with the same disturbance. This checks the fitted controller on the collection condition; it is not a held-out generalization test.

<figure><img src="/images/writing/imitation-learning/recovery.svg" alt="Toy nearest-neighbor policy saturates outside its initial narrow data range and accumulates lateral error, while adding expert labels at rollout-visited offsets permits stronger corrections" loading="lazy"><figcaption>Reproducible scalar simulation using the dynamics, expert, seven initial samples, and one aggregation round described in the text. The policies really are fitted nearest-neighbor predictors, but this is a teaching model, not a robotics benchmark or a reproduction of the DAgger paper.</figcaption></figure>

<details><summary>Play the toy recovery comparison</summary><img src="/images/writing/imitation-learning/recovery.gif" alt="Two markers advance through control steps: the initially fitted policy drifts away from the reference while the refitted policy stays closer after receiving extra expert labels"></details>

The expert itself settles at $e=0.05$ under this disturbance because $-0.6e+0.03=0$ there. The refitted nearest-neighbor policy can fluctuate around that value. There is no reason to expect zero offset from this controller. This example isolates one benefit of adding labels where the learner goes; it says little about high-dimensional perception or the cost of obtaining those labels.

## What interactive supervision requires

An expert needs to provide a useful action at the visited situation. A human operator may need time to inspect the scene, and a robot may have reached a configuration from which the task is already unrecoverable. Takeover-based collection is useful, but labeling only takeover moments changes which contexts receive supervision compared with querying every visited step.

The student also needs enough information to predict the labels. If the expert sees a hidden object pose while the student sees one ambiguous image, more training may leave conflicting targets for indistinguishable inputs. Better observations, history, or a distribution over actions may be needed.

Collecting learner-influenced rollouts on hardware requires the same command limits and supervision appropriate to that robot. Simulation, controlled perturbations, or an existing controller can help collect recovery examples. The appropriate choice depends on the system; the dataset-aggregation idea alone does not guarantee feasible execution or improvement at every iteration.

## Other ways to use demonstrations

Behavior cloning and interactive expert labeling are not the whole field. Inverse reinforcement learning tries to infer a reward or cost consistent with demonstrated behavior, then use that objective for control. Many objectives can explain the same limited demonstrations, so the inferred reward is not automatically the expert's unique intention.

[Generative Adversarial Imitation Learning, by Ho and Ermon](https://arxiv.org/abs/1606.03476), learns a discriminator that distinguishes expert behavior from policy-generated behavior and uses its signal to train a policy. A discriminator is a learned classifier; its feedback supplies a training signal rather than paired expert actions at every learner state. The approach still requires policy-generated environment experience in its usual formulation, even though it does not require a hand-written task reward.

Action chunks provide another design choice within imitation learning. Predicting several commands together can capture relationships between them. [ACT and the ALOHA system](https://tonyzhaozh.github.io/aloha/) are a concrete example. The executed prefix and observation frequency still determine how quickly the policy can respond to a disturbance. My diffusion post discusses that tradeoff in more detail.

## Data collection and evaluation

I would begin by specifying the variation the policy should handle: starting robot configurations, object poses, relevant appearances, and stages where recovery matters. More frames of nearly identical approaches do not necessarily cover a shifted object or a partially completed grasp.

Image augmentation can teach tolerance to selected visual changes, such as crops or lighting variation. A transformed example must preserve the intended action label or transform that label consistently. A horizontal image flip, for example, may require changes to the action coordinates and camera interpretation. Visual augmentation alone does not demonstrate physical recovery from a slipped grasp.

I would split complete episodes before constructing overlapping training windows, and hold out the conditions used for the final claim. Depending on the question, that may require holding out objects, recording sessions, or operators as well. Fit normalization using training data only. If long episodes contribute more windows, they also contribute more weight unless the sampler compensates for that.

For evaluation, I want both prediction metrics and actual rollouts. Held-out action loss measures agreement with labels; task success measures whether the task is completed under specified conditions. Their units and purposes differ. The [robomimic study](https://arxiv.org/abs/2108.03298) examines how demonstration quality and algorithmic choices affect robot learning, including the mismatch between training objectives and evaluation.

A success rate also needs a denominator and test conditions. An invented result of 16 successes in 20 attempts is an estimate of $0.8$, with substantial uncertainty from so few runs. I would report the attempts, how resets were chosen, and the failure patterns rather than presenting that number as a universal property of the policy. It is not a result from any experiment in these notes.

The connection to [RL](/writing/reinforcement-learning-for-robots/) is that demonstrations can initialize behavior and subsequent reward-based training can improve it under a chosen objective. The connection to [VLAs](/writing/vla-from-ground-up/) is that a model using images and instructions can still be trained with imitation losses on recorded actions. Neither a large architecture nor a more expressive action distribution removes the need to understand which situations the data covers.

For me, the most useful question after fitting a policy is what its next input will look like after a small error. That connects the dataset to the controller, and helps decide whether the next useful step is a better model, a different observation, or another demonstration of how to recover.
