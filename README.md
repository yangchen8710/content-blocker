# 🔇 Content Blocker

一个 Chrome 浏览器扩展，可以按**站点**屏蔽网页上的任意 class/id 元素，规则持久化保存。

## 功能

- **按站点隔离**：每条规则绑定特定域名，不同站点的规则互不干扰
- **快速添加**：点击扩展图标，手动输入或一键扫描页面所有 class/id
- **测试预览**：添加前先测试屏蔽效果，随时可恢复
- **元素高亮**：点击高亮按钮在页面上圈出匹配元素，方便确认选择器
- **层级树展示**：扫描结果按 DOM 深度分组/展开，附带元素前 4 个可见文字
- **管理页面**：按域名分组查看、编辑、删除、批量启用/禁用，支持 JSON 导入导出
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
| 添加规则 | 点击图标 → 输入选择器 → 添加 / 或扫描页面点选 |
| 测试效果 | 点击 👁 按钮临时屏蔽，确认后点 ＋ 保存 |
| 定位元素 | 点击 🔍 按钮在页面上高亮匹配元素 |
| 管理规则 | 右键图标 → 选项，支持按站点筛选、编辑、导入导出 |

## 项目结构

```
content-blocker/
├── manifest.json      # Chrome Extension V3 配置
├── content.js         # 内容脚本（屏蔽 + 高亮 + DOM 扫描）
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
- `chrome.scripting` / `chrome.tabs.sendMessage` 通信
- 纯 HTML/CSS/JS，无外部依赖
