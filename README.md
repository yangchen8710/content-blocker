# 🔇 Content Blocker

一个 Chrome 浏览器扩展，可以按**站点**屏蔽网页上的任意 class/id 元素，规则持久化保存。

## 功能

- **按站点隔离**：每条规则绑定特定域名，不同站点的规则互不干扰
- **悬停预览**：鼠标划过扫描结果中的选择器，页面上对应元素即时高亮（蓝色脉冲框 + 浮动标签）
- **快速添加**：手动输入选择器 / 一键扫描页面所有 class/id，在层级树中点选
- **测试后恢复**：添加前先测试屏蔽效果（👁），确认后保存（＋），随时可恢复
- **元素高亮**：点击 🔍 按钮在页面上用彩色虚线框固定标记元素，支持同时高亮多个
- **层级树展示**：扫描结果按 DOM 深度分组折叠 / 展开平铺，附带元素前 20 个可见文字
- **管理页面**：按域名分组查看、编辑、删除、批量启用/禁用，JSON 导入导出
- **持久化**：基于 `chrome.storage.local`，规则永久保存

## 安装

1. 克隆仓库
   ```
   git clone https://github.com/yangchen8710/content-blocker.git
   ```
2. 打开 Chrome → `chrome://extensions/`
3. 开启右上角「开发者模式」
4. 点击「加载已解压的扩展程序」→ 选择项目文件夹
5. 固定扩展图标到工具栏

## 使用

| 操作 | 方式 |
|------|------|
| 添加规则 | 手动输入选择器 → 添加 / 或扫描页面在树中点选 ＋ |
| 定位元素 | **鼠标悬停**选择器即可在页面上预览对应元素 |
| 固定高亮 | 点击 🔍 按钮，页面上用彩色虚线框持久标记元素 |
| 测试效果 | 点击 👁 临时屏蔽，确认后点 ＋ 保存为永久规则 |
| 管理规则 | 右键图标 → 选项，按站点筛选、编辑、批量操作、导入导出 |

## 项目结构

```
content-blocker/
├── manifest.json      # Chrome Extension V3 配置
├── content.js         # 内容脚本（屏蔽 + 高亮 + 悬停预览 + DOM 扫描）
├── popup.html         # 弹出窗口
├── popup.js
├── options.html       # 管理页面
├── options.js
├── icons/             # 扩展图标
└── .gitignore
```

## 技术栈

- Chrome Extension Manifest V3
- `chrome.storage.local` 持久化
- `chrome.tabs.sendMessage` 实现 popup ↔ content script 双向通信
- `chrome.scripting` 注入 CSS / 执行脚本（备用通道）
- 纯 HTML/CSS/JS，无外部依赖
