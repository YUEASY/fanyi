# 牛逼翻译

用于英文技术网页学习的 Edge/Chromium 扩展。

## 本地加载

1. 打开 `edge://extensions` 或 `chrome://extensions`。
2. 开启“开发人员模式”。
3. 选择“加载解压缩的扩展”，然后选择仓库中的 `extension` 目录。
4. 点击工具栏中的“牛逼翻译”，输入一个完整的 `http` 或 `https` 页面网址并启用。

扩展只会在与输入网址 `hostname` 完全相同的网站上标记潜在生词。启用状态保存在浏览器扩展本地存储中。

## 验证

```powershell
npm install
npx playwright install chromium
npm test
```

如需复用本机已有的 Chromium，可将其绝对路径放入 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 环境变量。
