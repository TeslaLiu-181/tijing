export const EXAMPLE_CATEGORIES=[
 {id:'geometry',label:'动态几何'},
 {id:'composite',label:'复合场'},
 {id:'electric',label:'电场与加速'},
 {id:'magnetic',label:'有界磁场'},
 {id:'relationships',label:'关系与约束'},
 {id:'sources',label:'粒子束'}
];

/** Names describe native examples; all numeric choices are demonstration values. */
export const EXAMPLE_CATALOG=[
 {id:'geometry-regular-field',title:'正多边形电场',category:'geometry',description:'调整 n、R，观察场域、速度与能量曲线联动。',keywords:'polygon regular 多边形 边数 半径',recommended:{variables:true,plotGroup:'energy',selectedParameter:'n'}},
 {id:'annular-electric',title:'环形电场与无场内孔',category:'geometry',description:'调整内、外半径，比较两段有场加速与中间无场匀速。',keywords:'annulus ring 环形 内孔 双边界 电功',recommended:{variables:true,plotGroup:'energy',selectedParameter:'R'}},
 {id:'geometry-wedge-field',title:'三角磁场出射',category:'geometry',description:'在推荐范围内调整 L、α、r，观察顺时针出射转角。',keywords:'wedge triangle 三角形 夹角 半径',recommended:{variables:true,plotGroup:'velocity',selectedParameter:'\\alpha'}},
 {id:'geometry-transform-fields',title:'旋转区域，保持场方向',category:'geometry',description:'改变 α 旋转整个区域，比较电场方向与进出位置。',keywords:'rotate transform 旋转 变换',recommended:{variables:true,plotGroup:'velocity'}},
 {id:'geometry-l-region',title:'L 形凹电场',category:'geometry',description:'调整 d 或拖动顶点，观察凹区域与电场同步变化。',keywords:'concave polygon 凹多边形 顶点',recommended:{variables:true,plotGroup:'velocity'}},
 {id:'geometry-intersections',title:'交点消失与恢复',category:'geometry',description:'改变 h，观察交点、场域和仿真的消失与恢复。',keywords:'intersection circle 交点 圆',recommended:{variables:true}},
 {id:'velocity-selector',title:'速度选择器',category:'composite',description:'比较三种入射速率，观察电场力与磁场力的平衡。',keywords:'velocity selector E B 速度选择 电磁',recommended:{plotGroup:'velocity'}},
 {id:'crossed-drift',title:'复合场中从静止开始',category:'composite',description:'从零初速出发，观察正交电磁场中的曲线运动。',keywords:'crossed drift 静止 漂移',recommended:{plotGroup:'velocity'}},
 {id:'field-cancellation',title:'重叠磁场抵消',category:'composite',description:'比较重叠区与非重叠区，观察实际合力和运动变化。',keywords:'overlap cancellation 重叠 抵消 合力',recommended:{plotGroup:'force'}},
 {id:'cyclotron',title:'回旋加速器',category:'electric',description:'观察粒子穿过交变电场间隙后的动能与轨道变化。',keywords:'cyclotron accelerator 交变 加速器',recommended:{plotGroup:'energy'}},
 {id:'electric-deflection',title:'静电场加速与偏转',category:'electric',description:'比较速度分量与动能，观察匀强电场中的偏转。',keywords:'electric deflection acceleration 偏转 匀强电场',recommended:{plotGroup:'energy'}},
 {id:'circle',title:'圆形有界磁场',category:'magnetic',description:'观察负电粒子的转向与进出圆形场的轨迹。',keywords:'circle circular 圆 负电荷',recommended:{plotGroup:'velocity'}},
 {id:'rectangle',title:'矩形磁场进出',category:'magnetic',description:'定位进出场事件，比较场内弧线与场外直线。',keywords:'rectangle boundary 矩形 边界',recommended:{plotGroup:'force'}},
 {id:'double',title:'相邻不同磁场',category:'magnetic',description:'跨过两个场域，比较磁场强度不同造成的转向。',keywords:'double adjacent 相邻 两场',recommended:{plotGroup:'velocity'}},
 {id:'quadrant',title:'第一象限磁场',category:'magnetic',description:'观察第一象限内的圆弧与边界出射方向。',keywords:'quadrant 第一象限 圆弧',recommended:{plotGroup:'velocity'}},
 {id:'dependency-circle',title:'交点与等半径依赖',category:'relationships',description:'移动直线，观察入射交点与等半径关系持续联动。',keywords:'dependency circle intersection 交点 等半径 依赖'},
 {id:'dependency-triangle',title:'根式边长比',category:'relationships',description:'调整 a，观察根式边长比、入射点与区域同步变化。',keywords:'dependency triangle sqrt 根式 边长比',recommended:{variables:true}},
 {id:'source',title:'点源扇形粒子束',category:'sources',description:'比较不同发射方向的真实轨道和磁场进出事件。',keywords:'source beam fan 点源 扇形 粒子束'}
];

export const exampleMetadata=id=>EXAMPLE_CATALOG.find(item=>item.id===id)||null;
