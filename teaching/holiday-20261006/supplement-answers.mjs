export const supplementAnswerOverrides={
 '2-10':String.raw`**答案：C。**

电流向右，自由电子向左漂移。向下的磁场使电子偏向后表面，后表面聚集负电荷，所以前表面电势较高。

稳定时，电子的电场力与洛伦兹力平衡：

$$e\frac Ud=evB.$$

电流的截面积为 $dh$，因此 $I=nevdh$。两式联立得

$$n=\frac{BI}{Ueh},\qquad U=\frac{BI}{neh}.$$

洛伦兹力大小为 $eU/d$，不是 $eU/h$。增大电流会增大霍尔电压。

**原解析校勘：** 原文前面的选项分析和题首答案均判定 C，最后一行的“AC”与之矛盾，应为 C。`,
 '6-10':String.raw`**答案：B。**

甲球只有重力做功，机械能守恒；乙球的电场力向右，而运动中向左位移，电场力做负功，机械能减小。设轨道半径为 $R$，则最低点的动能分别为

$$K_M=mgR,\qquad K_N=mgR-qER<mgR.$$

甲球所受洛伦兹力随速率增大而增大，乙球所受的电场力 $qE$ 保持不变，所以 C 错误。

在最低点，甲球速度向左、磁场向纸里；正电荷的洛伦兹力向下。由向上为正的向心力方程

$$N_M-mg-qBv_M=\frac{mv_M^2}{R}$$

可得

$$N_M=3mg+qB\sqrt{2gR},\qquad N_N=3mg-2qE.$$

因此 $N_M>N_N$，甲球对轨道的压力较大，D 错误。

**原解析校勘：** 原文 D 项解析把最低点的洛伦兹力误取向上，并写成“无法比较压力”。受力方向与原题图不符；修正后仍选 B。`,
};
export const supplementAnswerNotes={
 '6-3':String.raw`**连续模型的时间边界：** 若令 $a_0=F/m-\mu g>0$、$\beta=\mu qB/m$，则

$$v(t)=\frac{a_0}{\beta}(1-e^{-\beta t}),\qquad x(t)=\frac{a_0}{\beta}\left[t-\frac{1-e^{-\beta t}}{\beta}\right].$$

速度只在无限时间趋近 $v_\infty=(F-\mu mg)/(\mu qB)$。题干“运动位移为 $x$ 时恰好达到最大速度”是教材对终端状态的理想化表述；有限时刻仍有 $v<v_\infty$。任意实际运动区间都有 $W_f>\mu mgx$、$K<Fx-\mu mgx$，因此教材意图对应 D。`,
 '4-7':String.raw`**接触与终端状态：** 正方向取沿杆向下，所需法向约束会在 $qBv=mg\cos\alpha$ 时换向。因此压力大小应写为

$$N=|mg\cos\alpha-qBv|,\qquad a=g\sin\alpha-\frac\mu mN.$$

接触面换向时 $N=f=0$，加速度最大。之后速度渐近

$$v_\infty=\frac{mg(\sin\alpha+\mu\cos\alpha)}{\mu qB}.$$

“最后匀速”表示终端极限；连续模型不会在有限时刻精确到达。`,
 '6-12':String.raw`**能量去向：** 全程机械能指动能与重力势能之和。它的减少量为

$$\Delta E_{\rm mech}=fl+qEh=(4\sqrt3+0.4)\times10^{-5}\,\mathrm J.$$

其中 $fl=0.4\times10^{-5}\,\mathrm J$ 转化为内能，$qEh=4\sqrt3\times10^{-5}\,\mathrm J$ 转化为电势能，不能把全部机械能减少都称作摩擦耗散。`,
};
