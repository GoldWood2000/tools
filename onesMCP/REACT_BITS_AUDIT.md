# React Bits 组件盘点

盘点基于 `DavidHDev/react-bits` main 分支，共 166 个组件。工作台采用高频生产工具标准：动效必须解释状态、层级或反馈，不为装饰阻塞操作。

## 已采用

| 组件 | 使用位置 | 适配 |
| --- | --- | --- |
| `SpotlightCard` | 四个迭代指标卡 | 改为浅色主题，仅精细指针设备显示聚光 |
| `CountUp` | 指标数值 | 缩短到约 550ms，支持 `prefers-reduced-motion` |
| `StarBorder` | OAuth 授权按钮 | 仅用于低频连接动作，统一 Orbit 色彩和按钮反馈 |

新增的 `WorkflowRail` 不是 React Bits 原有组件：它把当前节点、每个合法下一跳和目标节点压缩成可读路径，用于批量执行前的安全确认。

## 全部组件

### Text Animations（32）

ASCIIText、BlurText、CircularText、CountUp、CurvedLoop、DecryptedText、DepthText、EchoText、FallingText、FoldText、FuzzyText、GlitchText、GradientText、MaskedHeading、ParticleText、RotatingText、ScrambledText、ScrollFloat、ScrollReveal、ScrollVelocity、ShinyText、Shuffle、SplitFlapText、SplitText、StrokeText、TextCursor、TextLoop、TextPressure、TextType、TrueFocus、VariableProximity、WarpText。

### Animations（37）

AnimatedContent、Antigravity、BlobCursor、ClickSpark、Crosshair、Cubes、CursorGrid、ElasticMesh、ElectricBorder、FadeContent、GhostCursor、GlareHover、GradualBlur、HalftoneReveal、ImageTrail、LaserFlow、LogoLoop、MagicRings、Magnet、MagnetLines、MetaBalls、MetallicPaint、Noise、OrbitImages、PixelSwap、PixelTrail、PixelTransition、Ribbons、RippleDistortion、ScrollExpand、ShapeBlur、SplashCursor、StarBorder、StickerPeel、Strands、SwarmCursor、TargetCursor。

### Components（44）

AccordionGallery、AnimatedList、BorderGlow、BounceCards、BubbleMenu、CardNav、CardSwap、Carousel、ChromaGrid、CircularGallery、Counter、CurvedInput、DecayCard、DepthCarousel、Dock、DomeGallery、DriftWall、ElasticSlider、FlowingMenu、FluidGlass、FlyingPosters、Folder、GlassIcons、GlassSurface、GooeyNav、InfiniteMenu、Lanyard、LineSidebar、MagicBento、Masonry、ModelViewer、MorphSlider、OptionWheel、PillNav、PixelCard、ProfileCard、ReflectiveCard、ScrollStack、SpecularButton、SpotlightCard、Stack、StaggeredMenu、Stepper、TiltedCard。

### Backgrounds（53）

AcidSquares、Aurora、Balatro、Ballpit、Beams、ColorBends、DarkVeil、Dither、DotField、DotGrid、EvilEye、FaultyTerminal、Ferrofluid、FloatingLines、Galaxy、GradientBlinds、GradientWaves、Grainient、GridDistortion、GridMotion、GridScan、Hyperspeed、Iridescence、LetterGlitch、LightPillar、LightRays、LightTunnel、Lightfall、Lightning、LineWaves、LiquidChrome、LiquidEther、MoltenMetal、Orb、Particles、PixelBlast、PixelSnow、Plasma、PlasmaWave、Prism、PrismaticBurst、Radar、RippleGrid、Scanner、ShapeGrid、SideRays、Silk、SlicedWaves、SoftAurora、Threads、Topography、Waves、WebThreads。

## 暂不采用的原因

- 光标、粒子、WebGL 背景：持续运行且分散对任务状态的注意力。
- 3D 卡片、画廊、轮播：与表格和批量工作流没有信息结构上的对应关系。
- `AnimatedList`：其全局方向键监听会影响表格、复选框和键盘可访问性。
- `Stepper`：适合线性表单向导，不适合不同事项拥有不同工作流分支的场景。
- GSAP 类进入动效：当前页面无需为一次淡入额外引入第二套动画运行时。
