I find RL easier to follow when I start with the controller. At each timestep, some sensor measurements come in, a command goes out, and the robot moves. Learning changes how that command is chosen. The rest of the system still has to work: the motors, the estimator, the timing, and whatever limits sit between the policy and the hardware.

These are my notes on how the pieces fit together. I am using a small reaching example for the math, with a few references to locomotion and manipulation along the way.

<figure class="video-figure"><iframe src="https://www.youtube-nocookie.com/embed/8sO7VS3q8d0" title="Learning to Walk in Minutes — Robotic Systems Lab, ETH Zurich" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="width:100%;aspect-ratio:16/9;border:0;border-radius:4px"></iframe><figcaption>ANYmal locomotion from <a href="https://leggedrobotics.github.io/legged_gym/">Learning to Walk in Minutes</a>, by Rudin, Hoeller, Reist and Hutter, Robotic Systems Lab, ETH Zurich. <a href="https://www.youtube.com/watch?v=8sO7VS3q8d0">Watch the authors’ video on YouTube</a>.</figcaption></figure>

## The control loop

At time $t$, the robot observes something, chooses an action, and changes the world. The next observation comes from that changed world. This feedback is what makes the problem different from predicting labels in a fixed dataset.

<figure><img src="/images/writing/rl-notes/loop.svg" alt="Robot sensors send an observation to a policy; the policy sends an action to the robot; experience is used to update the policy during training"><figcaption>During deployment, the observation–action loop remains. The policy-update step is a separate training operation; online learning is an additional design choice.</figcaption></figure>

For a robot arm, the state might include joint positions $q$, velocities $\dot q$, object pose, and contact conditions. An observation could be joint encoders plus camera images. The action might be torque, velocity, or a desired joint position passed to a lower-level controller. Those choices define very different learning problems.

For me, the action interface and the control timestep need to be clear before the algorithm discussion. Sending joint-position targets to a low-level controller gives the policy a different job from sending raw torques.

## States, actions, and return

A discounted Markov decision process is described by

$$
\mathcal M=(\mathcal S,\mathcal A,p,r,\rho_0,\gamma).
$$

Here $p(s_{t+1}\mid s_t,a_t)$ describes transitions, $r(s_t,a_t,s_{t+1})$ is the reward, and $\rho_0$ is the initial-state distribution. A policy chooses actions according to $a_t\sim\pi_\theta(\cdot\mid s_t)$.

My objective over a finite episode is

$$
J(\theta)=\mathbb E_{\tau\sim\pi_\theta}
\left[\sum_{t=0}^{T-1}\gamma^t r_t\right].
$$

This averages over trajectories. Initial conditions, disturbances, and the randomness of the policy all affect the return, so I would want to look at several runs rather than pick a successful one.

The Markov assumption means the state contains the information needed to predict the next-state distribution given an action. A camera frame often does not: it may hide velocity, occluded objects, or whether something is slipping. In practice I may need observation history, a state estimator, or a recurrent policy:

$$
a_t\sim\pi_\theta(\cdot\mid o_{0:t},a_{0:t-1}).
$$

That is a partially observed problem, even if the simulator has access to a complete state. [Spinning Up](https://spinningup.openai.com/en/latest/spinningup/rl_intro.html) is a useful reference for the notation; these notes use a finite episode unless stated otherwise.

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

The actor uses these estimates to adjust the policy. Errors in the critic then affect which actions the update encourages, which is one reason value learning deserves as much attention as the policy network.

## PPO

PPO collects experience using a policy and then optimizes a surrogate objective. For the clipped version, define the probability ratio

$$
\eta_t(\theta)=
\frac{\pi_\theta(a_t\mid o_t)}{\pi_{\theta_{\rm old}}(a_t\mid o_t)}.
$$

The policy objective is

$$
L^{\rm clip}(\theta)=\mathbb E_t\left[
\min\left(\eta_t\hat A_t,
\operatorname{clip}(\eta_t,1-\epsilon,1+\epsilon)\hat A_t\right)
\right].
$$

The clipping limits the incentive for certain large probability-ratio changes in this objective. It does not impose a hard bound on the robot’s motion or guarantee a small change in behavior. A practical implementation also needs value learning and choices about entropy, normalization, batching, and advantage estimation. The [original PPO paper](https://arxiv.org/abs/1707.06347) is the right place to check the actual objective.

PPO is primarily on-policy: it relies on recently collected experience from the behavior policy used for the update. Off-policy methods such as [Soft Actor-Critic](https://arxiv.org/abs/1801.01290) can reuse experience through a replay buffer. SAC also includes an entropy term in its objective. The ability to reuse data is attractive when collecting robot experience is expensive. Whether it helps enough on a particular setup still needs to be measured.

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

where $\xi$ could represent masses, friction coefficients, delays, or observation noise. The choice of distribution matters. Randomizing friction in a narrow range will not tell me much about a surface far outside that range.

[Tobin et al.](https://arxiv.org/abs/1703.06907) studied visual domain randomization for simulation-to-real transfer. For a control example, [Solving Rubik's Cube with a Robot Hand](https://arxiv.org/abs/1910.07113) describes automatic domain randomization in a real robotic manipulation system. The robot-hand work is useful here because it connects the training distribution to a concrete hardware problem.

## Back at the robot

Before trying a policy on hardware, I would go back through the observation and action definitions, check the timing, and test what happens when the measurements are noisy or delayed. I would also evaluate task completion separately from reward. It is possible to improve the number being optimized without making the behavior I care about more reliable.

What interests me is how much of the eventual behavior comes from the learned policy and how much comes from the rest of the setup: the low-level controller, the reward, the reset distribution, and the simulator. Those choices are easy to leave out of a short explanation of RL, but they are part of the experiment.

---

The plots and reaching animation in these notes are analytical examples and a reproducible simulation with hand-designed controllers. The ANYmal video is the authors’ RL demonstration linked above.
