# 工业效率流水线工具

一个帮助工业团队**追踪降本增效进度**的可视化流水线工具。节点可拖拽绘制，负责人可点击查看档案，打开即用，无需安装，无需账号。

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![No Dependencies](https://img.shields.io/badge/dependencies-none-brightgreen.svg)
![Offline](https://img.shields.io/badge/offline-capable-orange.svg)

---

## Features

- **可绘制流水线画布** — 拖拽节点自由布局，箭头实时跟随重绘
- **显眼 SVG 箭头** — 4px 描边、实心三角箭头头部、流动脉冲动画
- **节点三态可视化** — 颜色 + 图标 + 百分比，色盲安全
- **`＋` 一键插入节点** — 悬停节点边缘出现插入手柄，快速扩展流水线
- **负责人档案抽屉** — 点击头像查看姓名、部门、职位、联系方式
- **内联编辑** — 单击编辑项目名称/负责人，双击编辑节点名称/负责人
- **加权进度计算** — 节点权重 × 子任务权重，自动归一化，实时刷新
- **子任务管理** — 添加/删除/勾选子任务，权重可调
- **协作动态日志** — 记录勾选历史，最多 100 条
- **数据持久化** — localStorage 自动保存，刷新不丢失
- **零依赖** — 纯 HTML + CSS + JS，无框架，无构建步骤

## Quick Start

```bash
# Clone
git clone https://github.com/yangx18/industry-visible-pipline.git
cd industry-visible-pipline

# Open — that's it
open index.html        # macOS
# or xdg-open index.html  # Linux
# or start index.html     # Windows
```

无需安装任何依赖。双击 `index.html` 即可在浏览器中使用。

## File Structure

```
├── index.html       # HTML 壳：结构、模板、SVG defs、对话框
├── pipeline.css     # 所有样式：主题变量、画布、节点、箭头、抽屉
├── pipeline.js      # 所有逻辑：状态管理、绘图引擎、渲染、事件处理
├── DESIGN.md        # 设计文档（中文）
└── README.md        # 本文件
```

三个文件必须放在同一目录下，`index.html` 用相对路径引用 CSS 和 JS。

## Usage

| 操作 | 方式 |
|------|------|
| 选择节点 | 单击节点卡片 |
| 移动节点 | 拖拽节点顶部标题栏 |
| 插入新节点 | 悬停节点 → 点击左/右侧 **＋** 按钮 |
| 删除节点 | 悬停节点 → 点击右上角 🗑 按钮（仅中间节点） |
| 编辑节点名称 | 双击节点名称 |
| 编辑项目名称 | 单击顶部标题 |
| 查看负责人档案 | 点击节点内的头像区域 |
| 勾选子任务 | 在下方详情面板中勾选 Checkbox |
| 添加子任务 | 在输入框输入后按 Enter 或点击「添加」 |
| 重置进度 | 点击顶部「重置进度」按钮 |

## Deploy to GitHub Pages

1. 上传 `index.html`、`pipeline.css`、`pipeline.js` 到仓库根目录
2. Settings → Pages → Source: `main` branch, root directory
3. 访问 `https://<username>.github.io/industry-visible-pipline/`

## Browser Support

Chrome, Firefox, Safari, Edge（现代版本）。

## License

MIT
