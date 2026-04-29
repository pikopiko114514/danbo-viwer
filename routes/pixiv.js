import express from "express";
import puppeteer from "puppeteer";

const router = express.Router();

router.get("/search", async (req, res) => {
  const keyword = req.query.q || "AI生成";
  const pageNumber = req.query.p || "1";
  let browser;

  try {
    browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();

    // Cookieセット
    if (process.env.PIXIV_COOKIE) {
        await page.setCookie({
            name: "PHPSESSID",
            value: process.env.PIXIV_COOKIE.replace("PHPSESSID=", ""),
            domain: ".pixiv.net",
            path: "/",
            secure: true,
            httpOnly: true
        });
    }
    
    const encodedKeyword = encodeURIComponent(keyword);
    const targetUrl = `https://www.pixiv.net/tags/${encodedKeyword}/artworks?mode=r18&s_mode=s_tag_full&p=${pageNumber}`;
    
    console.log(`Fetching: ${targetUrl}`);

    // 修正箇所: タイムアウトを60秒に延長し、waitUntil を変更
    await page.goto(targetUrl, { 
        waitUntil: "domcontentloaded", // "networkidle2" より早く完了判定されます
        timeout: 60000                 // 60秒まで待機するように延長
    });

    // 追加: domcontentloaded の後に少し待機を入れるとより安定します
    await new Promise(r => setTimeout(r, 2000));

    // 画像をロードさせるための自動スクロール
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 400;
            const timer = setInterval(() => {
                const scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;
                if (totalHeight >= scrollHeight || totalHeight > 3000) {
                    clearInterval(timer);
                    resolve();
                }
            }, 100);
        });
    });

    // データの抽出
    const results = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href*="/artworks/"]'));
        const seen = new Set();
        const items = [];

        for (const link of links) {
            const href = link.getAttribute("href") || "";
            const match = href.match(/artworks\/(\d+)/);
            if (!match) continue;

            const id = match[1];
            if (seen.has(id)) continue;
            seen.add(id);

            const img = link.querySelector("img");
            // LazyLoad対策: srcがなければ data-src を見る
            let rawUrl = img?.src || img?.getAttribute("src") || img?.getAttribute("data-src") || "";

            if (!rawUrl || rawUrl.includes('common/images/limit_')) continue;

            // 絶対パス化
            if (rawUrl.startsWith('/')) rawUrl = "https://www.pixiv.net" + rawUrl;

            // ★ここで確実に定義する: displayUrl の置換ロジック
            const displayUrl = rawUrl
                .replace(/\/c\/\d+x\d+[^/]*\//, '/')
                .replace(/\/(custom-thumb|img-obfuscated)\//, '/img-master/')
                .replace(/_(square1200|master1200|custom1200)\.(jpg|png|jpeg|gif)/, '_master1200.jpg');

            items.push({
                id,
                url: displayUrl, // 定義済みの変数を使用
                tags: img?.alt || "",
                score: 0,
                isPixiv: true
            });
        }
        return items;
    });

    await browser.close();
    res.json(results);

  } catch (e) {
    if (browser) await browser.close();
    console.error("Pixiv Search Error:", e);
    res.status(500).json({ error: e.message });
  }
});

export default router;