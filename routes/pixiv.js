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

    const results = await page.evaluate(() => {
        // 1. 画像を包んでいるスパン（ご提示いただいたクラス sc-faf95030-0 など）をすべて取得
        // クラス名は変わる可能性があるため、[data-gtm-value] という属性名で探すのが最も確実です
        const items = Array.from(document.querySelectorAll('[data-gtm-value][data-gtm-user-id]'));

        return items.map(item => {
            const id = item.getAttribute('data-gtm-value');
            const userId = item.getAttribute('data-gtm-user-id');
            const img = item.querySelector('img');
            
            if (!img || !id) return null;

            const altText = img.alt || ""; // 例: "#五等分の花嫁 中野家水着集合 - 黒結(くろゆい)のイラスト"
            const rawUrl = img.src || "";

            // --- 作者名の抽出 (alt属性から「 - 」と「のイラスト」の間を抜く) ---
            let userName = "不明";
            if (altText.includes(' - ')) {
                const parts = altText.split(' - ');
                if (parts.length > 1) {
                    // 「黒結(くろゆい)のイラスト」から「のイラスト」を消す
                    userName = parts[1].replace(/の(イラスト|マンガ|小説)$/, "");
                }
            }

            // --- 画像URLの整形 (サムネイルからオリジナルに近いマスター版へ) ---
            const displayUrl = rawUrl
                .replace(/\/c\/\d+x\d+[^/]*\//, '/') // サイズ制限を解除
                .replace(/\/(custom-thumb|img-obfuscated)\//, '/img-master/')
                .replace(/_(square1200|master1200|custom1200)\.(jpg|png|jpeg|gif)/, '_master1200.jpg');

            // --- 投稿日の抽出 ---
            const dMatch = rawUrl.match(/\/img\/(\d{4}\/\d{2}\/\d{2})\//);
            const postDate = dMatch ? dMatch[1] : "";

            return {
                id: id,
                url: displayUrl,
                tags: altText,
                pageCount: 1, // HTMLからは枚数は不明だが、基本1として処理
                date: postDate,
                userName: userName,
                userId: userId,
                isPixiv: true
            };
        }).filter(Boolean); // 無効なデータを排除
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