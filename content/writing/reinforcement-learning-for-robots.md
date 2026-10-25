I find RL easier to follow when I start with the controller. At each timestep, some sensor measurements come in, a command goes out, and the robot moves. Learning changes how that command is chosen. The rest of the system still has to work: the motors, the estimator, the timing, and whatever limits sit between the policy and the hardware.

These are my notes on how the pieces fit together. I am using a small reaching example for the math, with a few references to locomotion and manipulation along the way.

<figure class="video-figure"><iframe src="https://www.youtube-nocookie.com/embed/8sO7VS3q8d0" title="Learning to Walk in Minutes — Robotic Systems Lab, ETH Zurich" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="width:100%;aspect-ratio:16/9;border:0;border-radius:4px"></iframe><figcaption>ANYmal locomotion from <a href="https://leggedrobotics.github.io/legged_gym/">Learning to Walk in Minutes</a>, by Rudin, Hoeller, Reist and Hutter, Robotic Systems Lab, ETH Zurich. <a href="https://www.youtube.com/watch?v=8sO7VS3q8d0">Watch the authors’ video on YouTube</a>.</figcaption></figure>

## The control loop

A timestep is one update of the decision-making loop. At time $t$, the robot observes something, chooses an action, and changes the world. The next observation comes from that changed world. This feedback is what makes the problem different from predicting labels in a fixed dataset.

<figure><img src="/images/writing/rl-notes/loop.svg" alt="Robot sensors send an observation to a policy; the policy sends an action to the robot; experience is used to update the policy during training"><figcaption>During deployment, the observation–action loop remains. The policy-update step is a separate training operation; online learning is an additional design choice.</figcaption></figure>

A policy is the rule used to choose an action from the information available to the robot. I write it as $\pi_\theta$, where $\theta$ represents adjustable parameters, such as neural-network weights. Running the policy computes a command using those weights. Learning changes the weights using collected experience.

A deterministic policy returns a particular command for a given input. A stochastic policy specifies a distribution over commands. For a small discrete example, it might assign probabilities $0.6$, $0.3$, and $0.1$ to moving forward, holding still, and moving backward. Sampling an action means drawing one of those choices according to that distribution. Continuous actions are often described by probability densities, such as a Gaussian with a predicted mean and spread.

For a robot arm, the state might include joint positions $q$, velocities $\dot q$, object pose, and contact conditions. An observation could be joint encoders plus camera images. The action might be torque, velocity, or a desired joint position passed to a lower-level controller. Those choices define very different learning problems.

For me, the action interface and the control timestep need to be clear before the algorithm discussion. Sending joint-position targets to a low-level controller gives the policy a different job from sending raw torques.

## States, actions, and return

An episode is one run of a task, such as attempting a grasp from a reset condition until success, failure, or a time limit. A trajectory records the sequence of states, actions, and rewards generated during that run. Different resets and actions can produce different trajectories.

A discounted Markov decision process, or MDP, is one mathematical description of this interaction:

$$
\mathcal M=(\mathcal S,\mathcal A,p,r,\rho_0,\gamma).
$$

The symbols describe the task I am defining:

| Symbol | Meaning in the robot task |
|---|---|
| $\mathcal S$ | Possible states of the robot and relevant environment |
| $\mathcal A$ | Allowed actions under the chosen control interface |
| $p(s_{t+1}\mid s_t,a_t)$ | Distribution of the next state after an action |
| $r(s_t,a_t,s_{t+1})$ | A numerical reward for the transition |
| $\rho_0$ | Distribution of starting conditions |
| $\gamma$ | Discount factor controlling the weight of later rewards |

The transition distribution allows for uncertainty: the same command need not produce exactly the same motion every time. The initial-state distribution specifies what the robot gets to practice, including object placement and robot configuration. A policy chooses actions according to $a_t\sim\pi_\theta(\cdot\mid s_t)$. The vertical bar means “conditioned on,” and $\sim$ means that the action is sampled from the distribution on the right.

A reward $r_t$ is one number received after an action. The return $G_t$ combines rewards from that point onward. With an episode ending after step $T-1$,

$$
G_t=\sum_{k=0}^{T-t-1}\gamma^k r_{t+k}.
$$

The index $k$ counts steps into the future relative to $t$. A reward received now is weighted by 1, the next by $\gamma$, the next by $\gamma^2$, and so on. Negative rewards are allowed; a policy may be trying to make a cumulative penalty less negative.

My objective over a finite episode is

$$
J(\theta)=\mathbb E_{\tau\sim\pi_\theta}
\left[\sum_{t=0}^{T-1}\gamma^t r_t\right].
$$

Here $\tau$ denotes a whole trajectory and $\mathbb E$ is an expectation: an average weighted by how likely different outcomes are. In practice, I estimate it using a finite set of runs. For an invented three-episode example, returns of $0.81$, $0.81$, and $0$ have sample mean $0.54$. Three episodes would be far too little evidence to characterize a difficult robot task, but the arithmetic shows what is being averaged.

Initial conditions, disturbances, and the randomness of the policy all affect the return. The initial-state distribution is therefore part of what a performance claim means.

## What the robot can actually observe

The state is the description used in the dynamics model; the observation is what the controller can measure. The Markov assumption means the state contains the information needed to predict the next-state distribution given an action. Once that state is known, earlier history does not provide extra predictive information under the model.

For a point mass, knowing its position alone leaves out velocity. Two runs can pass through the same position while moving in opposite directions. Applying the same force then produces different future positions.

<figure><img src="/images/writing/rl-notes/hidden-velocity.png" alt="Generated illustration of a robot at the same position relative to a target while moving toward it in one case and away in the other" loading="lazy"><figcaption>A schematic comparison of two possible motions. The arrows and ghost positions reveal velocity that a single position measurement would omit; they are explanatory annotations, not additional measurements available to the policy.</figcaption></figure>

The action-selection rule can only use the information it receives. A single camera frame may leave out velocity, occluded objects, or whether something is slipping. I may need several recent observations, a state estimator that combines measurements with a motion model, or a recurrent policy that carries an internal memory between decisions:

$$
a_t\sim\pi_\theta(\cdot\mid o_{0:t},a_{0:t-1}).
$$

Here $o_{0:t}$ means all observations from the start through time $t$, and $a_{0:t-1}$ means the preceding actions. A practical controller may compress that history into a short window or a memory state. That is a partially observed problem, even if the simulator has access to a complete state. [Spinning Up](https://spinningup.openai.com/en/latest/spinningup/rl_intro.html) is a useful reference for the notation; these notes use a finite episode unless stated otherwise.

## Delayed reward and earlier actions

Suppose an illustrative grasping task gives reward only when a mug has been lifted. At three decision steps, the robot reaches toward it, closes the gripper, and lifts. If the rewards are $[0,0,1]$ and $\gamma=0.9$, then

$$
G_0=0+0.9(0)+0.9^2(1)=0.81,
\qquad G_1=0.9,\qquad G_2=1.
$$

The early actions receive zero immediate reward, yet they affect whether the final reward can occur. Credit assignment is the problem of using outcomes to improve the earlier decisions that helped produce them. Assigning return to an action in a learning update is a statistical training signal; one successful trajectory does not establish that each earlier action caused the success.

<figure><img src="/images/writing/rl-notes/delayed-reward.png" alt="Generated illustration of a robot reaching for a mug, closing its gripper, and lifting it, with reward arriving at the lift" loading="lazy"><figcaption>A conceptual three-stage task with a terminal success reward. The reward convention and three-step discretization are chosen for this explanation, rather than measured from a robot experiment.</figcaption></figure>

Sparse rewards can make exploration difficult. If nearly every early attempt fails, many different action sequences produce the same uninformative return. Exploration means collecting experience with alternatives rather than repeatedly taking only the currently favored action. On hardware, the range of those alternatives still has to respect the controller's operating limits.

## Choosing a reward

Suppose a one-dimensional end effector must reach a target $x^\star$. A deliberately simple reward is

$$
r_t=-w_x(x_t-x^\star)^2-w_v v_t^2-w_u u_t^2.
$$

The first term rewards accuracy; the second discourages moving quickly near the target; the third penalizes control effort. The weights specify how much each behavior matters. Their units and relative scales affect the solution. A large effort penalty can make doing very little preferable to completing the task.

<figure><img src="/images/writing/rl-notes/reward.svg" alt="Reward plotted against position error: a quadratic distance reward gives feedback away from the target, while a sparse reward changes only inside a small success region" loading="lazy"><figcaption>Analytical illustration. The dense curve is −e²; the sparse reward is 1 when |e| &lt; 0.1. Their numerical scales are not matched for an algorithm comparison.</figcaption></figure>

A sparse success reward says clearly what I want, but may give little guidance before the first success. A dense reward provides guidance, but can favor an unintended shortcut. I should test the reward on deliberately bad behaviors: hovering near an object, exploiting contact, moving without finishing, or terminating early.

I would keep the actuator limits outside the reward function. A torque penalty makes large commands less attractive during optimization; a hard limit actually bounds what reaches the motor. The controller still needs termination conditions and a reliable way to stop the robot.

## Discounting and the control timestep

For an infinite stream of unit rewards, the discounted sum is $1/(1-\gamma)$ when $0\leq\gamma<1$. That gives a rough horizon measured in steps. To relate it to the robot, I need to include the duration of each step.

If I want an exponential discount time constant $\tau_d$ in seconds, a useful parameterization is

$$
\gamma=\exp(-\Delta t/\tau_d).
$$

<figure><img src="/images/writing/rl-notes/discount.svg" alt="Future reward weight versus seconds: fixed gamma at different control timesteps changes the effective time horizon, while gamma derived from a time constant preserves it" loading="lazy"><figcaption>Analytical discount weights. Holding γ = 0.99 while changing the control timestep changes how strongly the objective values the same future time.</figcaption></figure>

If I double the control frequency and leave every other setting unchanged, I have changed more than the number of actions. I may also have changed the effective horizon, the reward accumulated per second, and the meaning of a smoothness penalty. For a reward intended as a continuous-time rate, multiplying it by $\Delta t$ is part of a consistent discretization.

## Values and advantages

The state value is expected future return from a state under the policy. The action value additionally fixes the first action:

$$
V^\pi(s)=\mathbb E_\pi[G_t\mid s_t=s],\qquad
Q^\pi(s,a)=\mathbb E_\pi[G_t\mid s_t=s,a_t=a].
$$

For a stationary discounted problem, the Bellman relation is

$$
Q^\pi(s,a)=\mathbb E\left[r_t+
\gamma\,\mathbb E_{a'\sim\pi(\cdot\mid s')}Q^\pi(s',a')\right].
$$

In a finite-horizon task, remaining time belongs in the state or the value function needs a time index. At a true terminal state, there is no future reward to bootstrap. An artificial time-limit truncation is not automatically the same thing as task termination.

The advantage compares an action with the policy's average expectation at that state:

$$
A^\pi(s,a)=Q^\pi(s,a)-V^\pi(s).
$$

The superscript $\pi$ matters: these values describe continuing with a particular policy after the state or first action. A favorable state under one policy can be less favorable under another that has not learned how to finish the task.

For a small numerical example, suppose the policy chooses between two actions with equal probability and their action values are 3 and 1. Its state value is $0.5(3)+0.5(1)=2$. The advantages are therefore $+1$ and $-1$. They compare each choice with the policy's average expectation at that state, rather than with zero reward.

An actor is the module representing the policy. A critic estimates a value function used to train it. In actor–critic methods, the actor uses these estimates to adjust its choices, and the critic is fitted using collected transitions. The actor and critic can share parts of a network, but their training roles differ.

## How the critic learns

The Bellman relation breaks expected future return into an immediate reward plus discounted value after the transition. Instead of waiting for a complete episode every time, I can form a learning target using an existing estimate of the next state:

$$
y_t=r_t+\gamma m_t\hat V_{\rm old}(s_{t+1}),
\qquad
\delta_t=y_t-\hat V_{\rm old}(s_t).
$$

The hat marks an estimate. The continuation indicator $m_t$ is zero at a true terminal transition and one when the task continues. The quantity $\delta_t$ is a temporal-difference, or TD, error: it compares one estimate with a target built from an observed reward and another estimate.

If $r_t=1$, $\gamma=0.9$, $m_t=1$, and the next-state estimate is $1.5$, the target is $2.35$. If the current-state estimate was 2, the TD error is $0.35$.

Using an estimate to help construct another estimate is called bootstrapping. It can make learning possible before an episode finishes, but errors in the next-state estimate also affect the target. A simple value-fitting loss is

$$
\mathcal L_V(\phi)=\mathbb E
\left[(V_\phi(s_t)-y_t)^2\right],
$$

where $\phi$ denotes critic parameters and $y_t$ is held fixed during this regression update. Gradient descent adjusts $\phi$ to reduce the squared prediction error. Practical algorithms differ in how they construct and refresh these targets.

An advantage estimate can use a one-step TD error or combine several future TD errors. Generalized advantage estimation, or GAE, is one such weighted combination, with a parameter $\lambda$ controlling how strongly longer sequences contribute. This introduces a tradeoff: longer-return estimates can be noisy, while shorter bootstrapped estimates depend more heavily on the learned critic. The [original GAE paper](https://arxiv.org/abs/1506.02438) develops that estimator in detail.

## How an actor gets a learning signal

In supervised learning, a dataset can supply a desired action. In RL, the collected outcome instead helps estimate whether a sampled action was useful. A policy-gradient update changes the probability of actions in directions associated with better return.

For the finite discounted objective above, one form of the stochastic policy gradient is

$$
\nabla_\theta J=
\mathbb E_\tau\left[
\sum_{t=0}^{T-1}\gamma^t
\nabla_\theta\log\pi_\theta(a_t\mid s_t)
\bigl(G_t-b(s_t)\bigr)
\right],
$$

assuming the environment dynamics and starting distribution do not depend on $\theta$. Here $b(s_t)$ is a baseline that does not depend on the sampled action. Subtracting it can reduce the variability of the gradient estimator without changing its expectation under these assumptions. A value estimate is a common choice.

The gradient is a vector describing how a quantity changes with each parameter. The term $\nabla_\theta\log\pi_\theta(a_t\mid s_t)$ describes how the log-probability of the sampled action changes as the policy weights change. Multiplying it by a positive return relative to baseline encourages that action's probability; a negative value pushes in the other direction. These effects are combined across samples, whose parameter updates can also affect other actions and states.

The expectation is approximated with sampled trajectories. A minibatch is a subset of that collected data used for an optimization step. No derivative of the robot's physical transition function is required for this likelihood-based estimator; the transitions are used to collect experience. This is the useful connection between trial-and-error interaction and gradient-based optimization.

The explicit $\gamma^t$ here follows the particular discounted episodic objective I wrote earlier; other derivations package discounting into a state-visitation distribution or use another return convention. [Spinning Up's policy-optimization notes](https://spinningup.openai.com/en/latest/spinningup/rl_intro3.html) work through the likelihood-based derivation.

## PPO

Proximal Policy Optimization, or PPO, collects experience using a policy and then optimizes a surrogate objective. A surrogate is a more convenient training objective used to guide an update; its value is not a direct measurement of the robot's task performance. In PPO, the old policy is the one used to collect the current batch of experience, and the new policy is the parameter setting being optimized. For the clipped version, define the probability ratio

$$
\eta_t(\theta)=
\frac{\pi_\theta(a_t\mid o_t)}{\pi_{\theta_{\rm old}}(a_t\mid o_t)}.
$$

For discrete actions, the ratio compares the new and old probabilities of the same sampled action under the same observation. For continuous actions, the corresponding ratio uses probability densities. A density is not the probability of one exact real-valued action; the probability of a region is obtained by integrating it.

If the new policy assigns twice the density or probability to a sampled action, the ratio is 2. If it assigns half, the ratio is $0.5$. The advantage estimate determines whether increasing or decreasing that likelihood is favorable in the objective.

The policy objective is

$$
L^{\rm clip}(\theta)=\mathbb E_t\left[
\min\left(\eta_t\hat A_t,
\operatorname{clip}(\eta_t,1-\epsilon,1+\epsilon)\hat A_t\right)
\right].
$$

The clipping operation clamps its input to the interval $[1-\epsilon,1+\epsilon]$. The hat on $\hat A_t$ again means that the advantage is estimated from experience. The minimum selects the smaller of the two expressions for each sample before averaging.

For a discrete-action teaching example with $\epsilon=0.2$, I can calculate individual contributions explicitly:

| Estimated advantage | Old probability | New probability | Ratio | Contribution after the minimum |
|---:|---:|---:|---:|---:|
| $+1$ | 0.20 | 0.30 | 1.5 | 1.2 |
| $-1$ | 0.20 | 0.10 | 0.5 | −0.8 |
| $-1$ | 0.20 | 0.30 | 1.5 | −1.5 |

For the favorable action in the first row, the unclipped contribution is $1.5$, while the clipped contribution is $1.2$. The objective stops gaining from pushing that sample's ratio farther upward. In the second row, reducing an unfavorable action's likelihood too far similarly stops providing extra improvement from that sample. In the third row, increasing the likelihood of an unfavorable action still hurts the objective.

The resulting function is clipped asymmetrically according to the sign of the advantage. It does not simply replace every ratio in every calculation with a value between 0.8 and 1.2.

The clipping limits the incentive for certain large probability-ratio changes in this objective. It does not impose a hard bound on the robot’s motion or guarantee a small change in behavior. A practical implementation also needs value learning and choices about entropy, normalization, batching, and advantage estimation. Entropy describes the spread of a probability distribution: in a discrete example, a policy split evenly between two actions has higher entropy than one that almost always chooses the same action. An entropy term can encourage less concentrated choices during training. Continuous distributions require the corresponding differential-entropy treatment, including the action-scale convention.

Because neural-network parameters are shared across samples and several objective terms can contribute to the update, clipping one sample's incentive does not strictly constrain every probability ratio or the resulting behavior. The [original PPO paper](https://arxiv.org/abs/1707.06347) is the right place to check the actual objective.

## Reusing experience and measuring progress

PPO is primarily on-policy: it relies on recently collected experience from the behavior policy used for the update. Off-policy methods such as [Soft Actor-Critic](https://arxiv.org/abs/1801.01290) can reuse experience through a replay buffer. SAC also includes an entropy term in its objective. The ability to reuse data is attractive when collecting robot experience is expensive. Whether it helps enough on a particular setup still needs to be measured.

A replay buffer stores transitions such as $(s_t,a_t,r_t,s_{t+1})$ and terminal information, so an off-policy algorithm can sample previously collected experience for later updates. The algorithm must be designed for that use; old data cannot simply be substituted into any on-policy update. Data quality and coverage still limit what can be learned from a buffer.

Sample efficiency concerns how much environment experience is needed to reach a chosen level of performance. Wall-clock efficiency concerns how long the computation and collection take. Running many simulators in parallel can make collection fast without making each transition more informative.

When looking at a learning curve, I would separate episode return from task success, and check what the horizontal axis counts. Environment steps, optimizer updates, and elapsed seconds measure different resources. A single rising reward curve also leaves out variation across training seeds and evaluation conditions. The hand-designed simulation below is a control illustration, not such a learning curve.

## A reaching example

Before thinking about a humanoid, consider a one-dimensional point mass:

$$
v_{t+1}=v_t+u_t\Delta t,\qquad
x_{t+1}=x_t+v_{t+1}\Delta t.
$$

An action changes velocity, and velocity changes position. Being close to the target is not enough: arriving with large velocity can mean immediately overshooting it.

<details><summary>Play the reaching illustration</summary>
<img src="/images/writing/rl-notes/reaching.gif" alt="Two simulated point masses approach a target: a position-only feedback controller oscillates, while a controller with velocity damping settles near the target">
</details>

<figure><img src="/images/writing/rl-notes/trajectories.svg" alt="Position versus time for two hand-designed feedback controllers, showing oscillation without damping and settling with damping" loading="lazy"><figcaption>A toy simulation with hand-designed feedback controllers, not learned policies. The same trajectories drive the animation. Expand the illustration above to play it; this static plot conveys the same information without motion.</figcaption></figure>

Both controllers use $u_t=\operatorname{clip}(-k_p x_t-k_d v_t,-2,2)$ with target zero. I compare $k_d=0$ and $k_d=2.5$, keeping $k_p=3$, $\Delta t=0.04$ s, $x_0=-1$, and $v_0=0$.

Adding velocity feedback is enough to settle this simple system. I would want that baseline before training a policy: it gives me a way to see what the learning is adding, and whether the extra complexity is useful for the task.

## Moving from simulation to hardware

Simulation makes repeated trials practical. It also supplies assumptions about friction, mass, contact, actuator response, sensor quality, and timing. A policy can perform well under those assumptions and fail when one of them changes.

One approach is to train across randomized environments:

$$
J(\theta)=\mathbb E_{\xi\sim p(\xi)}
\left[J(\theta;\xi)\right],
$$

Here $\xi$ collects environment parameters, and $p(\xi)$ specifies how they are sampled for training. A mass might vary between episodes while a sensor-noise sample changes at every observation; the randomization schedule itself is part of the setup. The expectation averages performance across those sampled environments.

The components of $\xi$ could represent masses, friction coefficients, delays, or observation noise. The choice of distribution matters. Randomizing friction in a narrow range will not tell me much about a surface far outside that range.

[Tobin et al.](https://arxiv.org/abs/1703.06907) studied visual domain randomization for simulation-to-real transfer. For a control example, [Solving Rubik's Cube with a Robot Hand](https://arxiv.org/abs/1910.07113) describes automatic domain randomization in a real robotic manipulation system. The robot-hand work is useful here because it connects the training distribution to a concrete hardware problem.

## Back at the robot

Before trying a policy on hardware, I would go back through the observation and action definitions, check the timing, and test what happens when the measurements are noisy or delayed. I would also evaluate task completion separately from reward. It is possible to improve the number being optimized without making the behavior I care about more reliable.

What interests me is how much of the eventual behavior comes from the learned policy and how much comes from the rest of the setup: the low-level controller, the reward, the reset distribution, and the simulator. Those choices are easy to leave out of a short explanation of RL, but they are part of the experiment.

---

The numerical examples, generated illustrations, plots, and reaching animation in these notes are teaching constructions. The animation uses hand-designed controllers, and the illustrations are not measured robot rollouts. The ANYmal video is the authors’ RL demonstration linked above.
