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

    // 1. ページ移動
    await page.goto(targetUrl, { 
        waitUntil: "networkidle2", 
        timeout: 60000 
    });

    await page.waitForSelector('a[href*="/artworks/"]', { timeout: 15000 });

    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 1000; // 1回のスクロール量
            const maxScroll = 8000; // Pixivの1ページ分をカバーする十分な深さ
            const timer = setInterval(() => {
                window.scrollBy(0, distance);
                totalHeight += distance;

                // 十分な深さまでスクロールしたら終了
                if (totalHeight >= maxScroll) {
                    clearInterval(timer);
                    resolve();
                }
            }, 200); // 0.2秒おきにスクロール
        });
    });

    // 3. スクロール後、画像要素が整うまで1秒だけ待機
    await new Promise(r => setTimeout(r, 1000));

    // 3. データの抽出（うまく動いていたロジックをベースに日付抽出を追加）
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

            const card = link.parentElement; 
            const img = link.querySelector("img");
            let rawUrl = img?.src || img?.getAttribute("src") || img?.getAttribute("data-src") || "";

            if (!rawUrl || rawUrl.includes('common/images/limit_')) continue;

            // --- URLから投稿日を抽出 ---
            let postDate = "";
            const dateMatch = rawUrl.match(/\/img\/(\d{4}\/\d{2}\/\d{2})\//);
            if (dateMatch) {
                postDate = dateMatch[1];
            }

            // --- 枚数の抽出 ---
            let pageCount = 1;
            if (card) {
                const countElements = Array.from(card.querySelectorAll('span, div'));
                for (const el of countElements) {
                    const txt = el.innerText.trim();
                    if (/^\d{1,3}$/.test(txt) && el.offsetWidth < 40) {
                        pageCount = parseInt(txt);
                        break;
                    }
                }
            }

            if (rawUrl.startsWith('/')) rawUrl = "https://www.pixiv.net" + rawUrl;

            // サムネイルを大きなサイズに置換
            const displayUrl = rawUrl
                .replace(/\/c\/\d+x\d+[^/]*\//, '/')
                .replace(/\/(custom-thumb|img-obfuscated)\//, '/img-master/')
                .replace(/_(square1200|master1200|custom1200)\.(jpg|png|jpeg|gif)/, '_master1200.jpg');

            items.push({
                id,
                url: displayUrl,
                tags: img?.alt || "",
                pageCount: pageCount,
                date: postDate, // 追加した日付
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