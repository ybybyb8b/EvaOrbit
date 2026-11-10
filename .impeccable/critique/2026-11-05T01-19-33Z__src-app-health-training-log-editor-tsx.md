---
target: Training Complete & log 与运动关联
total_score: 19
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 3
target_identity: "file:E:\\EvaOrbit\\src\\app\\health\\training-log-editor.tsx"
target_fingerprint: "sha256:e4612661247dba8069f562e1866ebb4feaf5caa2e8155c5e9a764db84052ed66"
target_path: "E:\\EvaOrbit\\src\\app\\health\\training-log-editor.tsx"
timestamp: 2026-11-05T01-19-33Z
slug: src-app-health-training-log-editor-tsx
---
Method: dual-agent (A: /root/design_review · B: /root/evidence_review)

# Training Complete & log 审阅

整体判断：沿用的配色、字体、热身/正式训练分组符合 EvaOrbit；主要缺口是把训练计划编排界面直接当作完成记录界面，高频的完成操作排在大量低频配置之后。

| 启发式 | 分数/4 | 主要证据 |
|---|---:|---|
| 状态可见 | 2 | 有单项进度，缺少整体概览 |
| 符合现实任务 | 1 | 补记界面默认要求查看动作配置 |
| 用户控制 | 2 | 更换关联会丢草稿 |
| 一致性 | 2 | Portal 中未命中页面样式 |
| 防错 | 3 | 成功保存后推进、提交锁 |
| 识别优于记忆 | 2 | 有参考，信息层级弱 |
| 效率 | 1 | 每动作完成至少两步 |
| 简洁 | 1 | 测试表单2455px高 |
| 错误恢复 | 2 | 失败后需改日期重试 |
| 帮助 | 3 | 有保存/取消解释 |
| 合计 | 19/40 | 优先解决填写效率 |

## 优先问题

1. P1：逐条展开再标记。training-exercises.tsx:33。4动作+1视频测试需要9次点击全部标记完成；不必逐项标记也能保存，因此不能误称强制校验。建议记录模式显示紧凑动作摘要及直接完成按钮，并提供一次“全部按计划完成”，仅对差异展开调整。不要默认把未知完成状态写成完成。
2. P1：记录与编排混在一起。training-exercises.tsx:29–33。17个输入字段、43个按钮挤在手机表单中，内容2455px，可见高度660px。改名、移组、侧别等收进修改本次动作，保留动作名、目标和完成情况在主层。老师/课程等低频选填按需展开。建议 $impeccable distill。
3. P1：更换运动/日期入口弱且清空草稿。training-log-editor.tsx:78。首屏普通居中文字按钮，关联来源详情反占大块面积。实测先标记动作再更换会出现一次丢弃修改确认。建议把当前运动摘要、日期、时长和显式更换按钮放同一区域，更换时保留本次填写，只替换不可编辑的来源字段。建议 $impeccable clarify / distill。
4. P2：待选列表边框和不完整行布局。training-section.tsx:138、globals.css:2210/2225–2230/4684。Portal 不在 .health-page 下，历史列表去边框规则失效；缺 .training-workout-picker 包装。实测1px边框，列表368px但候选仅263px，min-height=0；桌面列表640px但候选201px。建议局部专用样式，列表去外框，候选全宽且元信息换行，空/加载时不渲染列表壳。建议 $impeccable layout / polish。

## 保留

- 成功保存后推进和幂等保护。
- Apple Health 来源事实只读、历史快照独立。
- 热身/正式训练分组和底部固定保存操作。

## 使用情境

- 刚练完单手操作：重复展开再标记，长表单造成疲劳。
- 首次填写：动作配置与完成情况混排；未选视频固定显示 Completed 文字也容易误解。
- 中途更换日期：已填内容被要求丢弃，产生明显回退成本。

范围应归 #208 的记录减负和本次关联区修正，不扩大为 #210 计划主页折叠重做。建议先 distill，最后 polish。

## Run Notes

- 两个独立评估，A完成后才合并B结果；源码未修改。
- Slug src-app-health-training-log-editor-tsx；无ignore列表。
- Detector只运行一次，3个组件，0 findings；不代表UX通过。
- 测试数据：独立React harness挂载真实TrainingSection/TrainingLogEditor/TrainingExercises/FormSheet，模拟HealthDataProvider，不访问真实账号或数据库。
- Chrome headless，402×874与1100×874，英文浅色；未做iPhone Safari真机或全部主题验证。
- 真实走查：多候选选择、4动作+视频完成、修改后更换关联确认、选择前一天记录；无横向溢出。
- 第一次fixture缺起止时间导致渲染失败，补齐模拟来源后完成；截图等待表单入场动画结束。
- 无用户可见浏览器/检测overlay；以静态截图和computed style作为视觉证据，未启动overlay服务器。
- 测试HTTP端口14207已关闭；初次10736也已关闭。脚本finally关闭浏览器和服务器。
- 截图与证据留tmp/training-review-*，用于复查；临时报告body在snapshot写入后删除。
