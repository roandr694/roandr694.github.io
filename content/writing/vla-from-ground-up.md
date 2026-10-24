When I read a VLA paper, I find it useful to follow one instruction all the way to the robot: “put the red cup in the sink.” Somewhere between that sentence and the gripper moving, there has to be a representation of the scene, a choice of what to do next, and a command that the controller can actually execute.

VLA stands for vision–language–action. The term describes a family of models that use visual observations and language to produce robot actions. A practical policy may also take joint measurements, previous observations, or an embodiment identifier. There is no single mandatory VLA architecture, action representation, or training algorithm.

I am going to build up the idea through a manipulation example. The notation is deliberately generic; where I discuss a particular system, I link to its authors.

## Starting with an ordinary robot policy

Suppose I already have a policy that moves an arm toward an object. A simple version might receive joint positions $q_t$, joint velocities $\dot q_t$, and an estimated target pose. It produces an action $a_t$:

$$
a_t=\pi_\theta(q_t,\dot q_t,p_t^{\rm target}).
$$

The parameters $\theta$ could be learned from demonstrations or optimized through reinforcement learning. Either way, I still need to decide what an action means. It could be a joint-position target, an end-effector displacement, or a torque command. The same vector length can mean very different things on two robots.

For a camera-based policy, I can replace the explicit object-pose input with an image $I_t$. The model then has to extract useful information from pixels. If I add a language instruction $\ell$, I can ask for different behaviors without training a separate policy for each instruction:

$$
a_t\sim\pi_\theta(\cdot\mid I_t,\ell,z_t),
$$

where $z_t$ denotes optional robot measurements such as joint positions or gripper state. A policy may use multiple cameras or a history of observations. This expression describes the information available to a model; it does not imply that a single camera frame fully describes the physical state.

For the cup example, the instruction identifies the desired behavior, the image shows the objects and their arrangement, and proprioception tells the policy something about its own configuration. The output has to connect all three to a physically meaningful movement.

## What the vision and language model contributes

A vision–language model, or VLM, is trained to relate images and text. For example, it may learn to answer questions about an image or generate a description conditioned on it. This gives it representations associated with objects, attributes, and language. A VLA adapts those representations to predicting actions using robot experience.

That distinction matters for data. Image–text pretraining can provide useful associations for “red,” “cup,” and “sink.” It does not directly supply the motor commands for grasping this cup with this gripper. Robot trajectories provide examples of how the observations and instructions relate to actions over time.

A system can also use a VLM to select a skill or generate a plan, with a separate controller doing the movement. That is a useful architecture, but it is different from a model whose learned output includes the robot action representation itself. I want to know which interface a paper means when it uses the word “action.”

<figure><img src="/images/writing/vla-notes/pipeline.svg" alt="Camera images go through a visual encoder; instruction words go through a text tokenizer; optional robot measurements are encoded; the resulting context conditions an action decoder and then a robot controller" loading="lazy"><figcaption>A generic VLA pipeline. Some models share a transformer between modalities; others attach a separate action expert or head. The low-level controller remains part of the deployed system.</figcaption></figure>

## Turning an image into tokens

A camera image starts as a grid of numbers. If an RGB image has height $h$ and width $w$, it contains $3hw$ channel values. A common vision-transformer approach divides the image into patches and turns each patch into an embedding vector.

With square patches of side length $p$, and dimensions divisible by $p$, the number of patches is

$$
N=\frac{h}{p}\frac{w}{p}.
$$

For a hypothetical $224\times224$ image with $16\times16$ patches, that gives 196 patch embeddings. This is an arithmetic example, not a specification of every VLA. Encoders may use different resolutions, pooled features, or several visual backbones.

If a visual feature is $v_i\in\mathbb R^{d_v}$ and the multimodal backbone expects dimension $d$, a projector can map between those spaces:

$$
\tilde v_i=Wv_i+b,\qquad W\in\mathbb R^{d\times d_v}.
$$

The projector can also be a multilayer network. Positional information helps retain which features came from which parts of an image. Multiple camera streams additionally need a consistent way to distinguish views.

These visual tokens are learned feature vectors. They are not necessarily discrete vocabulary IDs like text tokens, and they do not automatically correspond to a clean list of detected objects. A network can attend to information distributed across several patches.

## Adding language and robot measurements

The instruction is split by a text tokenizer and mapped to embeddings. Token boundaries need not line up with complete words. The model then receives a collection of representations for image content, language, and any additional inputs it supports.

One possible context is

$$
C_t=[\tilde v_1,\ldots,\tilde v_N,
e_1,\ldots,e_M,\phi(z_t)].
$$

This is schematic notation. Some architectures concatenate inputs, some use cross-attention, and some condition a separate action network on the VLM features. Attention masks determine which positions can interact; they are part of the model design.

At the level of one attention operation,

$$
\operatorname{Attention}(Q,K,V)=
\operatorname{softmax}\left(\frac{QK^\top}{\sqrt{d_k}}+B\right)V,
$$

where $B$ can include a mask. Queries are compared with keys to obtain weights, and those weights combine the values. All of these are learned representations. The mechanism gives the model a way to make its output depend on different parts of the context; the desired grounding comes from training.

With the same camera image, “pick up the red cup” and “pick up the blue cup” should lead to different actions. Whether the policy reliably makes that distinction is something to evaluate. A language input on its own does not establish that the robot is using it correctly.

## What comes out of the model?

Consider an illustrative end-effector action:

$$
a_t=[\Delta x,\Delta y,\Delta z,
\Delta\alpha,\Delta\beta,\Delta\psi,g]_t.
$$

The first components describe a position change, the next describe an orientation change under a specified convention, and $g$ controls the gripper. Other policies output joint configurations, velocities, or different rotation representations. Some include a termination signal. I need the dataset's definition before interpreting any of these numbers.

For example, $\Delta x=0.02$ only means “move two centimeters along x” if the system defines it in meters and as a displacement. I still need the coordinate frame. A translation expressed in a camera frame would be rotated into the robot base frame using

$$
\Delta p_{\rm base}=R_{{\rm base}\leftarrow{\rm camera}}
\Delta p_{\rm camera}.
$$

This equation is for a translation vector. Transforming full poses or spatial velocities requires the appropriate rigid-body transformation and conventions. Calibration errors enter here even if the model's prediction is otherwise sensible.

Normalized outputs introduce another step. If training used standardized values, one component might be decoded as

$$
a_j=\sigma_j\tilde a_j+\mu_j.
$$

Some systems instead use percentile-based scaling or special treatment for the gripper. Using the wrong normalization statistics can change the physical action substantially. Decoding belongs in the control interface, rather than being treated as a minor preprocessing detail.

## Discrete action tokens

One way to connect an action to a language-model backbone is to discretize continuous values into bins and represent the bins with tokens. [RT-2](https://robotics-transformer2.github.io/) uses tokenized action strings to train vision–language backbones for robotic control, together with vision–language tasks.

For an illustrative uniform discretization of a scalar $a\in[l,u]$ into $B$ bins,

$$
b(a)=\min\left(B-1,
\left\lfloor B\frac{\operatorname{clip}(a,l,u)-l}{u-l}\right\rfloor\right).
$$

Decoding to a bin center gives

$$
\hat a=l+\left(b+\frac12\right)\frac{u-l}{B}.
$$

For an in-range scalar, the maximum quantization error under this particular scheme is half a bin width. Real implementations may choose different ranges or boundaries; clipping an out-of-range value adds a separate error.

If an action is represented by a sequence $y_1,\ldots,y_m$, an autoregressive decoder models

$$
p_\theta(y_{1:m}\mid C_t)=
\prod_{j=1}^{m}p_\theta(y_j\mid C_t,y_{<j}).
$$

The decoder generates a token conditioned on the previous tokens, and a separate decoding step turns the sequence back into robot commands. This makes the vocabulary interface convenient, but introduces design choices around precision, sequence length, and inference time.

[OpenVLA](https://openvla.github.io/) provides a concrete example: its original architecture combines visual features from SigLIP and DINOv2, a projector, and a Llama 2 backbone that predicts tokenized actions. That is one implementation of a VLA, rather than a definition that every VLA must follow.

## Continuous actions and flow matching

Actions can also be generated by a continuous decoder. A simple deterministic head could predict a vector with a regression loss, but demonstrations may contain several valid movements for the same situation. Averaging them can produce an awkward action: going around the left or right side of an obstacle does not mean that going through its center is useful.

Generative action models aim to represent that distribution more flexibly. Diffusion and flow-matching approaches generate an action vector or a whole action chunk through an iterative process. Their equations and training targets differ; I am using a simple conditional flow-matching construction here to make the continuous case concrete.

Let $A$ be a demonstrated action chunk and $\varepsilon$ a Gaussian noise sample of the same shape. Define an interpolation at generative time $s\in[0,1]$:

$$
X_s=(1-s)\varepsilon+sA.
$$

Its path derivative is $A-\varepsilon$. A conditional velocity network can be trained with

$$
\mathcal L_{\rm flow}=\mathbb E
\left[\left\|v_\theta(X_s,s,C_t)-(A-\varepsilon)\right\|_2^2\right].
$$

At inference, initialize $X_0$ with noise and numerically integrate

$$
\frac{dX_s}{ds}=v_\theta(X_s,s,C_t)
$$

from $s=0$ to $s=1$. The result is a candidate action chunk conditioned on the observation and instruction. Here $s$ is the time variable of the generative procedure; it is separate from physical robot time $t$.

This describes one simple interpolation and parameterization. Particular models can use different noise schedules, time conventions, conditioning, and solvers. [Physical Intelligence's original π₀](https://www.pi.website/blog/pi0) combines a pretrained VLM with an action expert using flow matching for continuous action outputs.

## Why predict several actions at once?

A chunking policy predicts a sequence of future actions:

$$
A_t=(a_{t\mid t},a_{t+1\mid t},\ldots,a_{t+H-1\mid t}).
$$

The second index records when the prediction was made. Predicting a coherent chunk can capture short motion patterns and reduce how often the expensive model needs to be called. The execution system may apply only the first $K$ actions, where $K\leq H$, before gathering another observation and predicting again.

<figure><img src="/images/writing/vla-notes/chunks.svg" alt="A policy predicts six future actions, executes the first two, observes again, and replaces the remainder with a new prediction" loading="lazy"><figcaption>An illustrative receding-horizon schedule with H = 6 and K = 2. Real systems choose horizons, overlap and timing according to the robot and policy.</figcaption></figure>

Executing a longer portion of a chunk reduces calls to the model, but leaves more time between observation updates. If an object slips halfway through, an old prediction may continue moving toward where the object used to be. Closed-loop operation depends on how predictions are refreshed and executed.

Latency also changes which observation an action refers to. At a 20 Hz action rate, there are 50 ms between commands. An illustrative 200 ms inference time spans four action intervals. A real system needs a defined strategy for that delay: buffering, asynchronous inference, prediction alignment, shorter execution windows, or another timing design. Receding-horizon notation alone does not solve synchronization.

## How the robot data trains the policy

A demonstration dataset can be written as

$$
\mathcal D=\{(I_t,\ell,z_t,A_t)\},
$$

with the inputs and target actions aligned in time. For tokenized actions, behavior cloning can minimize negative log-likelihood:

$$
\mathcal L_{\rm BC}=-\mathbb E_{\mathcal D}
\left[\sum_j\log p_\theta(y_j\mid C_t,y_{<j})\right].
$$

During this kind of training, the preceding target tokens can be provided to the decoder through teacher forcing. A continuous generative decoder instead uses its corresponding training objective, such as the flow loss above. The exact modules being updated depend on the training recipe: an entire backbone, a subset of weights, adapters, or an action head.

The data alignment is important enough to examine separately. I want to know when the image was captured, when proprioception was sampled, what command the demonstrator issued, and when that command reached the controller. Those timestamps are related but can differ. Pairing an observation with the wrong action can make the learning target inconsistent.

Language labels also vary in quality. A whole episode might have the instruction “put the cup in the sink,” while only a small part of it shows the grasp. A model has to relate that task label to the relevant action at each stage. The demonstrations still need to cover useful behavior, recovery, and the situations in which the policy will be evaluated.

There is a second problem once the model starts controlling the robot: its own errors can put it in states that the demonstrations rarely contain. A slightly misplaced grasp can create a new visual situation, followed by another error. Low prediction loss on recorded demonstrations does not directly measure the ability to recover during a rollout.

## VLA, imitation learning, and reinforcement learning

These terms answer different questions. VLA describes the modalities and action-producing model. Imitation learning and reinforcement learning describe ways of obtaining or improving a policy.

A VLA can be trained by behavior cloning from human demonstrations. It can also be fine-tuned with rewards, preferences, corrections, or mixtures of data, depending on the system. In the RL formulation, the policy parameters are optimized for expected return rather than only matching demonstrated actions:

$$
J(\theta)=\mathbb E_{\tau\sim\pi_\theta}
\left[\sum_{t=0}^{T-1}\gamma^t r_t\right].
$$

That possibility does not mean that a model was trained with RL just because it is called a VLA. For each paper, I need to distinguish the backbone's pretraining, the robot-policy training, and any later adaptation. My [earlier notes on RL](/writing/reinforcement-learning-for-robots/) cover the reward and control side in more detail.

## What transfer between robots really involves

A broad training mixture can contain different cameras, grippers, joint counts, action conventions, and tasks. To share useful structure, a system may standardize parts of the action space, provide embodiment information, use robot-specific components, or adapt the model using target-robot data.

The phrase “works across robots” needs that context. An instruction can have a similar meaning on two platforms while the joint targets and reachability constraints differ substantially. Even with an end-effector action interface, the low-level control and kinematics still have to make the command feasible.

I would also separate visual transfer from behavioral transfer. Recognizing a new mug is useful, but a narrow handle, slippery surface, or different gripper width may require a different motion. Semantic familiarity and successful physical interaction are related capabilities with different failure cases.

<figure><video controls playsinline preload="none" style="width:100%;border-radius:4px"><source src="https://openvla.github.io/static/videos/carousel/bridge_pick_clutter_2.mp4" type="video/mp4">Your browser cannot play this video. <a href="https://openvla.github.io/">View the authors’ demonstrations.</a></video><figcaption>An OpenVLA manipulation example, embedded from the authors’ <a href="https://openvla.github.io/">project page</a>. The video belongs to that work; it is not an experiment from my projects.</figcaption></figure>

## Following the instruction through the whole system

Returning to the red cup: the cameras provide images, the language tokenizer represents the instruction, and the encoders produce the context used to predict actions. The output is decoded and unnormalized according to a specific robot interface. A controller executes it, new measurements arrive, and the policy is called again according to the system's timing scheme.

At each stage there are assumptions I can inspect. Does the camera show the sink? Is the action in the right frame? Does the gripper convention match the training data? How old is the image by the time the command executes? What happens if the grasp fails?

That is the level at which a VLA starts to make sense to me. The language and visual pretraining are useful parts of the policy, but I still want to trace how a predicted action becomes a movement and how the next observation changes what happens afterward.

## Sources

- [RT-2: Vision-Language-Action Models](https://robotics-transformer2.github.io/) — tokenized actions and transfer from vision–language pretraining.
- [OpenVLA](https://openvla.github.io/) — an open model with visual encoders, a projector, a language backbone, and tokenized actions.
- [π₀: Our First Generalist Policy](https://www.pi.website/blog/pi0) — a continuous action expert based on flow matching.

The two diagrams and the small numerical examples in this post are explanatory illustrations. They do not report measurements from a trained policy.
