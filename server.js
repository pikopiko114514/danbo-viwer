import express from "express";
import "dotenv/config";
import path from 'path';
import { fileURLToPath } from 'url';
import apiRouter from "./routes/api.js"; 
import proxyRouter from "./routes/proxy.js";

// ES Modulesで __dirname を再現する設定
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// 静的ファイル（index.html, favorites.html, style.css など）を public フォルダから提供
app.use(express.static(path.join(__dirname, 'public')));

// APIとプロキシのルートを設定
app.use("/api", apiRouter);
app.use("/img", proxyRouter);

// 「お気に入り画面」のルート
app.get('/favorites', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'favorites.html'));
});

// サーバーを起動
app.listen(PORT, () => {
    console.log(`-----------------------------------------`);
    console.log(`サーバーが起動しました！`);
    console.log(`URL: http://localhost:${PORT}`);
    console.log(`お気に入り: http://localhost:${PORT}/favorites`);
    console.log(`-----------------------------------------`);
});