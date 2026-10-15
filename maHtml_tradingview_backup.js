  function maHtml(tk) {
    const m = (D.ticker_ma || {})[tk];
    if (!m) return '<div class="card"><p style="color:var(--muted)">No moving-average data for this ticker.</p></div>';
    let h = "";
    // TradingView widgets via JS API (supports pre-loaded MA studies)
    const tvSym = tk === "RNMBY" ? "OTC:RNMBY" : "NASDAQ:" + tk;
    const intervals = { daily: "D", weekly: "W", monthly: "M" };
    const tvCharts = [];
    ["daily", "weekly", "monthly"].forEach((tf) => {
      const d = m[tf];
      if (!d) return;
      const cid = "tv-" + tk + "-" + tf;
      tvCharts.push({ cid, tf });
      h += '<div class="card"><h3 style="text-transform:capitalize">' + tf + ' <span class="verdict ' +
        (String(d.signal || "").toLowerCase().includes("buy") ? "bullish" : String(d.signal || "").toLowerCase().includes("sell") ? "bearish" : "neutral") +
        '">' + esc(d.signal || "") + "</span></h3>" +
        '<div id="' + cid + '" style="height:420px;width:100%;margin-bottom:12px;"></div>' +
        '<div style="font-size:12px;color:#a8b0bc;margin-bottom:10px;">Overlays: <b style="color:#c8d0dc;">SMA 10</b> · <b style="color:#c8d0dc;">SMA 20</b> · <b style="color:#c8d0dc;">SMA 50</b> · <b style="color:#c8d0dc;">SMA 200</b> (simple moving averages)</div>' +
        '<div class="table-wrap"><table class="coverage ma-table"><thead><tr><th>Period</th><th>SMA</th><th>EMA</th></tr></thead><tbody>' +
        ["10", "20", "30", "50", "100", "200"].map((p) =>
          "<tr><td>" + p + "</td><td>" + fmt$((d.sma || {})[p]) + "</td><td>" + fmt$((d.ema || {})[p]) + "</td></tr>"
        ).join("") + "</tbody></table></div>" +
        '<div class="panel-asof">Price ' + fmt$(d.price) + " · as of " + esc(d.as_of || "") + " · Chart by TradingView</div></div>";
    });
    // init TradingView widgets after DOM insert
    setTimeout(() => {
      if (typeof TradingView === "undefined") {
        const s = document.createElement("script");
        s.src = "https://s3.tradingview.com/tv.js";
        s.onload = initTV;
        document.head.appendChild(s);
      } else { initTV(); }
      function initTV() {
        tvCharts.forEach(({ cid, tf }) => {
          const el = document.getElementById(cid);
          if (!el || el.dataset.tvInit) return;
          el.dataset.tvInit = "1";
          try {
            const widget = new TradingView.widget({
              container_id: cid, symbol: tvSym, interval: intervals[tf],
              theme: "dark", style: "1", locale: "en", toolbar_bg: "#1a2332",
              hide_side_toolbar: false, allow_symbol_change: false,
              autosize: true,
              // add MA studies once chart is ready
              onChartReady: function() {
                try {
                  const chart = widget.chart();
                  [10, 20, 50, 200].forEach((len) => {
                    chart.createStudy("Moving Average Simple", false, false, { length: len });
                  });
                } catch (e) { console.error("TV study error", e); }
              }
            });
          } catch (e) { console.error("TV widget error", e); }
        });
      }
    }, 200);
    return h || '<div class="card"><p style="color:var(--muted)">No data.</p></div>';
  }
