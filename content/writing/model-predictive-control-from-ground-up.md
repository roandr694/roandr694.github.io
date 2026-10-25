I find Model Predictive Control easier to understand as a repeated calculation. Start from an estimate of where the robot is now. Predict how it would move under several future commands. Choose a sequence that makes progress while respecting the model and limits. Execute the first command, measure again, and solve a new problem.

The interesting part is how that repeated calculation becomes feedback. The controller has a plan, but its next decision starts from the state the robot actually reached. I want to build up the optimization problem carefully, then use a small simulation to see what changes when a disturbance makes the original prediction wrong.

## A model that predicts motion

A state is a collection of variables sufficient to describe the dynamics under the chosen model. For a point mass moving along a line, I can use position $p$ and velocity $v$:

$$
x_t=\begin{bmatrix}p_t\\v_t\end{bmatrix}.
$$

The input $u_t$ will be acceleration. If acceleration is constant during a control interval of duration $\Delta t$, the discrete model is

$$
p_{t+1}=p_t+v_t\Delta t+\tfrac12u_t\Delta t^2,
\qquad
v_{t+1}=v_t+u_t\Delta t.
$$

This is the exact integration of this simple continuous-time model over that interval. A different integration convention can give different coefficients. If the input were force, the acceleration would additionally depend on mass.

A numerical example: with $p_t=0$, $v_t=1$ m/s, $u_t=-1$ m/s², and $\Delta t=0.2$ s, the next position is $0.18$ m and the next velocity is $0.8$ m/s. Braking changes where the robot goes during the interval as well as its velocity afterward.

I can write the same dynamics compactly:

$$
x_{t+1}=Ax_t+Bu_t,
\qquad
A=\begin{bmatrix}1&\Delta t\\0&1\end{bmatrix},
\quad
B=\begin{bmatrix}\tfrac12\Delta t^2\\\Delta t\end{bmatrix}.
$$

The matrices are just a way to collect the coefficients of the two equations. The model is linear in the state and input. For a robot with nonlinear dynamics, I would instead write $x_{t+1}=f(x_t,u_t)$, or construct a local linear approximation.

## Predicting several steps ahead

At the current robot time $t$, let $x_{k\mid t}$ mean the predicted state $k$ steps into the future. The bar means that the prediction is being made at time $t$; it is not division.

The prediction begins from an estimated current state:

$$
x_{0\mid t}=\hat x_t,
\qquad
x_{k+1\mid t}=f(x_{k\mid t},u_{k\mid t}).
$$

The hat marks an estimate. Position may come from a sensor, while velocity may be estimated from several measurements and a motion model. In the simulation below, I assume the full state is known exactly so I can isolate the replanning behavior.

A prediction horizon of $N$ steps contains $N$ input commands and $N+1$ states including the initial state. Its duration is $N\Delta t$. For $N=20$ and $\Delta t=0.2$ s, the controller looks four seconds ahead.

For the linear model, the first two predictions are

$$
x_{1\mid t}=A\hat x_t+Bu_{0\mid t},
$$

$$
x_{2\mid t}=A^2\hat x_t+ABu_{0\mid t}+Bu_{1\mid t}.
$$

The second equation makes the coupling visible: the first command affects multiple future states. An acceleration that reduces today's position error can also create velocity that must be removed later.

<figure><img src="/images/writing/mpc/predicting-a-stop.png" alt="Conceptual robot illustration showing progressively closer predicted positions and shrinking velocity arrows as it brakes toward a target" loading="lazy"><figcaption>Generated conceptual illustration of anticipating a stop. The silhouettes show a proposed future motion, rather than measured positions or a guarantee that a particular robot will stop as drawn.</figcaption></figure>

## Specifying what the controller should prefer

Prediction alone does not say which motion is useful. I need a cost: a numerical way to compare candidate motions. Lower cost means more desirable under the choices I put into the objective.

For a reference state $x_{\rm ref}$ and reference input $u_{\rm ref}$, a common stage cost is

$$
\ell(x,u)=
(x-x_{\rm ref})^TQ(x-x_{\rm ref})
+(u-u_{\rm ref})^TR(u-u_{\rm ref}).
$$

The superscript $T$ means transpose. If $Q$ is diagonal, the first expression is a weighted sum of squared state errors. For this point mass, taking $Q=\operatorname{diag}(10,1)$ gives

$$
10(p-p_{\rm ref})^2+(v-v_{\rm ref})^2.
$$

The input term can discourage large commands. With a scalar input and $R=0.1$, it contributes $0.1(u-u_{\rm ref})^2$. These are chosen weighted penalties, not automatically physical energy. Their interpretation depends on units and scaling.

If I want to reach a position and stop, I can set $x_{\rm ref}=[2,0]^T$ and $u_{\rm ref}=0$ for this model. A robot hovering under gravity may need a nonzero reference input just to maintain its target state. The reference should be consistent with the dynamics if I expect the system to remain there.

A terminal cost $V_f(x_{N\mid t})$ evaluates the final predicted state. It helps express the value of how the plan ends, including motion that would otherwise continue beyond the horizon. A velocity penalty at the end discourages finishing the prediction close to the target but still moving quickly.

## The finite-horizon optimization problem

A nominal controller predicts a single trajectory using its chosen model, without explicitly optimizing over a set of possible model errors. One standard nominal MPC problem is

$$
\begin{aligned}
\min_{x_{0:N\mid t},\,u_{0:N-1\mid t}}\quad
&\sum_{k=0}^{N-1}\ell(x_{k\mid t},u_{k\mid t})
+V_f(x_{N\mid t})\\
\text{subject to}\quad
&x_{0\mid t}=\hat x_t,\\
&x_{k+1\mid t}=f(x_{k\mid t},u_{k\mid t}),\\
&x_{k\mid t}\in\mathcal X,\quad
u_{k\mid t}\in\mathcal U,\\
&x_{N\mid t}\in\mathcal X_f\quad\text{if a terminal set is imposed}.
\end{aligned}
$$

The colon notation $0:N$ means the sequence from index zero through $N$. The decision variables are the numbers the optimizer is allowed to choose. The dynamics equations constrain predicted states to agree with the commands and the initial estimate.

The sets $\mathcal X$ and $\mathcal U$ describe allowed states and commands. A state bound may also be imposed at the terminal state; the exact indexing should be stated in an implementation. The optional terminal set $\mathcal X_f$ restricts where the plan can end.

A solver is the numerical algorithm used to find a solution. The star in $u^\star_{0\mid t}$ denotes an optimized command. For a nonlinear problem, the available solution may be a local optimum or an approximate result, rather than a globally best plan.

The [OSQP MPC example](https://osqp.org/docs/examples/mpc.html) shows a concrete linear-quadratic formulation. My point-mass example uses its own model and weights, with a general numerical optimizer, rather than reproducing that example's quadcopter experiment.

## A one-step calculation by hand

Before solving a longer problem, I can simplify the numbers. For this paragraph only, use a one-second interval, start at rest at position zero, and aim for position one. The prediction is $p_1=\tfrac12u$.

Take the teaching objective to be just final position error plus input effort:

$$
J(u)=(\tfrac12u-1)^2+0.1u^2
=0.35u^2-u+1,
\qquad -1\leq u\leq1.
$$

The derivative $dJ/du=0.7u-1$ describes how the cost changes as I change the command. Setting it to zero gives an unconstrained minimum at $u=10/7\approx1.429$. That violates the acceleration limit. Over the allowed interval, the minimum is at $u=1$.

| Candidate acceleration | Predicted final position | Cost | Within the limit? |
|---:|---:|---:|---|
| $0$ | $0$ | $1$ | Yes |
| $1$ | $0.5$ | $0.35$ | Yes |
| $10/7$ | $5/7$ | $2/7\approx0.286$ | No |

<figure><img src="/images/writing/mpc/one-step-cost.svg" alt="Convex one-step cost curve with its unconstrained minimum outside the allowed acceleration interval, and the feasible minimum at the upper acceleration bound" loading="lazy"><figcaption>The exact cost in the worked one-step example. The green band is the allowed acceleration interval. This example uses a different timestep and simpler cost than the simulation below.</figcaption></figure>

The target cannot be reached in this one step under the limit. A cost can still return the best available compromise. If I instead require the hard equality $p_1=1$, this particular problem has no feasible solution.

## Costs and constraints do different jobs

A penalty makes a behavior expensive. A hard constraint excludes it from the mathematical feasible set. Increasing an effort penalty does not enforce an exact acceleration limit.

For the longer point-mass simulation, I impose

$$
-1\leq u_{k\mid t}\leq1\ \text{m/s}^2,
\qquad
-1\leq v_{k\mid t}\leq1\ \text{m/s},
$$

along with predicted position bounds of $-0.25$ to $2.5$ m. The optimizer must balance progress with these restrictions. It can accelerate, coast at the speed limit, and brake as approaching the reference becomes more important.

A soft constraint introduces a nonnegative slack variable that permits violation at a cost. For an upper position preference, one version is

$$
p_{k\mid t}\leq p_{\max}+s_k,
\qquad s_k\geq0,
$$

with an added penalty such as $\rho s_k^2$. The slack measures how much the original bound is relaxed. A large finite penalty makes that relaxation unattractive, but does not turn the preference into a hard physical guarantee.

The predictions also represent the chosen model at selected times. Real constraint satisfaction additionally depends on estimation, model error, discretization, and execution. Checking collision clearance only at a few prediction nodes can miss a collision between them.

## Executing the first command creates feedback

After solving for a whole sequence, standard receding-horizon MPC applies

$$
u_t=u^\star_{0\mid t}.
$$

At the next control step, it obtains a new estimate $\hat x_{t+1}$ and solves again. The unused part of the old plan may help initialize the next solve, but it is not a commitment to execute those commands unchanged.

```text
at each control update:
    estimate current state
    update references and relevant constraints
    solve the finite-horizon problem
    check solver result, feasibility, and deadline
    apply the first accepted command
    use the system's specified fallback if the solve is unusable
```

The fallback is an execution-system design choice. A command being numerically available does not mean it arrived in time or satisfied the acceptance checks.

This gives an implicit feedback policy: the current state changes the optimization problem, which changes the chosen first command. Even with a fixed dynamics model, MPC can therefore respond to disturbances. Replanning does not by itself mean the model is learning online.

## A disturbed point-mass simulation

Here I return to $\Delta t=0.2$ s and a 20-step horizon. The point mass starts at $[p,v]=[0,0]$ and targets $[2,0]$. I use $Q=\operatorname{diag}(10,1)$, $R=0.1$, and

$$
V_f(x_N)=(x_N-x_{\rm ref})^T
\operatorname{diag}(30,5)(x_N-x_{\rm ref}).
$$

The simulation solves the constrained problem at every update. For comparison, I also execute the initially optimized 20 commands unchanged. Both runs receive an unmodeled velocity change of $-0.5$ m/s at $t=1.2$ s, after that step's position update. The next state measurement reveals the change to MPC.

<figure><img src="/images/writing/mpc/closed-loop-comparison.svg" alt="Calculated position, velocity and acceleration traces compare replanning MPC with unchanged execution of the initial plan after the same velocity disturbance" loading="lazy"><figcaption>Original deterministic point-mass simulation with the model, costs, bounds, and disturbance specified in the text. These are computed trajectories, not hardware measurements or performance claims about a robot platform.</figcaption></figure>

The fixed command sequence continues as though the velocity change never happened. MPC uses the changed state to choose a new sequence. The resulting plots show feedback correction on this example; they do not establish robustness to all disturbances or superior performance to every other feedback controller.

<figure><img src="/images/writing/mpc/predicted-and-realized.svg" alt="Predicted position trajectories from three different replanning times are shown alongside the realized MPC position, illustrating how the four-second horizon moves forward" loading="lazy"><figcaption>Dashed lines are predictions made at different times. The solid line is the realized simulated motion. Each prediction starts from the state available at its own solve; it has no advance knowledge of the velocity disturbance.</figcaption></figure>

<details><summary>Play the replanning simulation</summary><img src="/images/writing/mpc/replanning.gif" alt="Two simulated point masses execute a fixed plan and receding-horizon MPC, while a moving prediction curve shows the MPC horizon being recomputed from the realized state"></details>

The animation uses the same solved trajectories as the plots. The top markers represent the point masses; the lower panel distinguishes the realized past from the current predicted future. I assume zero computation delay here. The optimization results are checked for convergence and numerical constraint satisfaction, but the simulation is not a real-time solver benchmark.

## Why horizon length and terminal design matter

A short horizon can make a future consequence invisible. At 1 m/s with at most 1 m/s² of braking, the ideal continuous-time stopping distance is

$$
d_{\rm stop}=\frac{v^2}{2a_{\max}}=0.5\ \text{m}.
$$

That calculation assumes constant maximum deceleration and ignores delay. A prediction that ends too soon may undervalue braking unless its terminal design accounts for the remaining motion. Increasing $N$ looks farther ahead, but also changes the computational problem. Decreasing the timestep while holding $N$ fixed shortens the horizon in seconds.

A terminal cost can approximate the cost of continuing after the prediction ends. A terminal set can restrict the final state to a region where a suitable local controller can continue operating. These have distinct roles, and arbitrary terminal weights do not automatically prove stability.

Recursive feasibility means that, after taking an accepted step, the next optimization remains feasible. Stability concerns how the closed-loop state behaves over time, such as approaching an equilibrium. Both require assumptions and a controller design that supports the claim. Repeatedly obtaining a low finite-horizon cost is insufficient on its own.

The textbook [Model Predictive Control: Theory, Computation, and Design, by Rawlings, Mayne and Diehl](https://sites.engineering.ucsb.edu/~jbraw/mpc/) is a reference for this theory. The terminal weights in my toy simulation are illustrative choices, not a stability certificate.

## Linear, nonlinear, and uncertain models

With linear dynamics, a cost built from nonnegatively weighted squares, and linear constraints, the problem can be a convex quadratic program. Convexity means that any local minimum is also global; it does not imply that numerical solvers have zero error or zero computation time.

For this class of problem, predicted states can be expressed as functions of the input sequence and the current state. Substituting those expressions into the objective leaves a quadratic problem in the commands. Alternatively, I can keep states and commands as variables and enforce the dynamics with equality constraints. [Tedrake's trajectory-optimization notes](https://underactuated.mit.edu/trajopt.html) explain these formulations.

Nonlinear MPC uses a nonlinear prediction model and can require iterative local optimization. Contact changes, friction, and the choice of which side of an obstacle to pass can make the problem more difficult. Even with linear motion dynamics, keeping a robot outside an obstacle generally creates a nonconvex allowed region.

Warm starting initializes a solve using a previous solution, often shifting the old sequence forward and appending a candidate final action. It can reduce numerical work. That initial guess still needs to be checked and improved; a shifted sequence is not automatically feasible under the new state and constraints.

Nominal MPC predicts one model trajectory. Robust formulations explicitly account for a specified uncertainty set, while stochastic formulations model uncertainty probabilistically. For example, a chance constraint bounds a modeled probability of violation. Any resulting claim depends on those uncertainty assumptions and on whether the bound concerns one event or an entire task.

## How this connects to learned policies

A standard MPC controller solves an explicit dynamics-and-cost problem during execution. A behavior-cloned policy predicts actions from learned examples. Both produce commands, but the computations and evidence supporting them differ.

The [Diffusion Policy post](/writing/diffusion-policy-from-ground-up/) also uses receding-horizon execution: generate a sequence, execute a prefix, and observe again. That shared execution pattern does not imply that diffusion sampling solves the explicit model-based optimization problem written here.

MPC and learning can also be combined. A learned dynamics model can supply predictions, a learned value function can help with terminal cost, and an MPC controller can provide labels for [imitation learning](/writing/imitation-learning-from-ground-up/). In [RL](/writing/reinforcement-learning-for-robots/), reward-based training can learn a policy that avoids solving the same explicit planning problem at every step. Each combination introduces its own model, data, and computation tradeoffs.

For me, the useful way to read an MPC implementation is to identify the state estimate, dynamics, objective, constraints, horizon in seconds, and the command that actually reaches the system. Those choices explain the resulting behavior more directly than the name of the solver alone.
