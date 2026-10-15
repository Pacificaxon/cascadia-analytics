/* Short Interest Chart - reusable dual-axis bar+line component
 * Usage: ShortInterestChart.render(containerEl, { ticker: "AXON", apiKey: "..." })
 * Renders multiple instances on the same page without collision.
 * Data: Financial Modeling Prep v4 short-interest endpoint (configurable).
 */
(function (global) {
  "use strict";

  var instanceCounter = 0;
  var CHART_RED = "#ef4444";
  var CHART_WHITE = "#ffffff";
  var BG_COLOR = "#000000";
  var GRID_COLOR = "rgba(255,255,255,0.12)";
  var TEXT_COLOR = "#9ca3af";

  function fmtMillions(v) {
    if (v == null) return "-";
    var m = v / 1e6;
    return (m >= 10 ? m.toFixed(0) : m.toFixed(1)) + "M";
  }

  function fmtDate(iso) {
    if (!iso) return "";
    var d = new Date(iso + "T12:00:00");
    if (isNaN(d)) return iso;
    var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return months[d.getMonth()] + " " + d.getDate();
  }

  function showLoading(el) {
    el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:280px;color:' +
      TEXT_COLOR + ';font-size:13px;">Loading short interest...</div>';
  }

  function showError(el, msg) {
    el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:280px;color:#f87171;' +
      'font-size:13px;text-align:center;padding:0 20px;">' + escapeHtml(msg) + "</div>";
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function fetchShortInterest(ticker, apiKey, dataUrl) {
    var url;
    if (dataUrl) {
      url = dataUrl.replace("{ticker}", encodeURIComponent(ticker));
    } else {
      url = "https://financialmodelingprep.com/api/v4/short-interest?symbol=" +
        encodeURIComponent(ticker) + "&apikey=" + encodeURIComponent(apiKey);
    }
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error("API returned " + res.status);
      return res.json();
    }).then(function (json) {
      var rows = Array.isArray(json) ? json : (json.data || json.results || []);
      // Normalize: FMP uses {date, shortInterest, shortFloat}; accept alternates
      return rows.map(function (r) {
        return {
          date: r.date || r.settlementDate || r.reportDate,
          shortInterest: r.shortInterest != null ? r.shortInterest : r.short_interest,
          shortFloat: r.shortFloat != null ? r.shortFloat : r.short_float
        };
      }).filter(function (r) {
        return r.date && r.shortInterest != null;
      }).sort(function (a, b) {
        return a.date < b.date ? -1 : 1;
      });
    });
  }

  function buildChart(canvas, rows, ticker) {
    var labels = rows.map(function (r) { return fmtDate(r.date); });
    var bars = rows.map(function (r) { return r.shortInterest; });
    var line = rows.map(function (r) {
      return r.shortFloat != null ? r.shortFloat * 100 : null;
    });

    // Dual-axis scaling: pad each axis 10% beyond its data range
    var maxBar = Math.max.apply(null, bars);
    var lineVals = line.filter(function (v) { return v != null; });
    var minLine = lineVals.length ? Math.min.apply(null, lineVals) : 0;
    var maxLine = lineVals.length ? Math.max.apply(null, lineVals) : 100;

    return new Chart(canvas, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Short interest",
            data: bars,
            backgroundColor: CHART_RED,
            borderRadius: 2,
            yAxisID: "y",
            order: 2
          },
          {
            label: "Short float",
            data: line,
            type: "line",
            borderColor: CHART_WHITE,
            backgroundColor: CHART_WHITE,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.2,
            yAxisID: "y1",
            order: 1,
            spanGaps: true
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(17,24,39,0.95)",
            titleColor: "#fff",
            bodyColor: "#d1d5db",
            callbacks: {
              label: function (ctx) {
                if (ctx.datasetIndex === 0)
                  return " Short interest: " + Number(ctx.raw).toLocaleString();
                return " Short float: " + Number(ctx.raw).toFixed(2) + "%";
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: TEXT_COLOR,
              maxTicksLimit: 6,
              maxRotation: 0
            }
          },
          y: {
            position: "left",
            beginAtZero: false,
            suggestedMax: maxBar * 1.1,
            grid: { color: GRID_COLOR, borderDash: [2, 4] },
            ticks: {
              color: TEXT_COLOR,
              callback: function (v) { return fmtMillions(v); }
            }
          },
          y1: {
            position: "right",
            beginAtZero: false,
            suggestedMin: Math.max(0, minLine - (maxLine - minLine) * 0.3),
            suggestedMax: maxLine + (maxLine - minLine) * 0.3,
            grid: { display: false },
            ticks: {
              color: TEXT_COLOR,
              callback: function (v) { return v + "%"; }
            }
          }
        }
      }
    });
  }

  function render(container, opts) {
    opts = opts || {};
    var ticker = (opts.ticker || "").toUpperCase();
    if (!ticker) throw new Error("ShortInterestChart.render requires opts.ticker");

    var id = "sic-" + (++instanceCounter);
    container.innerHTML =
      '<div style="background:' + BG_COLOR + ';border-radius:12px;padding:20px 16px 12px;">' +
      '<div style="font-size:22px;font-weight:600;color:#fff;margin-bottom:12px;">Short interest' +
      (opts.showTicker === false ? "" : ' <span style="font-size:13px;color:' + TEXT_COLOR + ';font-weight:400;">' + escapeHtml(ticker) + "</span>") +
      "</div>" +
      '<div style="display:flex;gap:24px;margin-bottom:8px;font-size:13px;color:' + TEXT_COLOR + ';">' +
      '<span><span style="display:inline-block;width:24px;height:4px;background:' + CHART_RED + ';border-radius:2px;vertical-align:middle;margin-right:8px;"></span>Short interest</span>' +
      '<span><span style="display:inline-block;width:24px;height:4px;background:' + CHART_WHITE + ';border-radius:2px;vertical-align:middle;margin-right:8px;"></span>Short float</span>' +
      "</div>" +
      '<div id="' + id + '-body" style="position:relative;height:300px;"></div>' +
      "</div>";

    var body = document.getElementById(id + "-body");
    showLoading(body);

    var chartRef = { instance: null, destroy: function () {
      if (chartRef.instance) { chartRef.instance.destroy(); chartRef.instance = null; }
    }};

    var promise;
    if (opts.data && Array.isArray(opts.data)) {
      promise = Promise.resolve(opts.data);
    } else if (!opts.apiKey && !opts.dataUrl) {
      showError(body, "No API key configured. Pass apiKey or dataUrl, or provide static data via opts.data.");
      return chartRef;
    } else {
      promise = fetchShortInterest(ticker, opts.apiKey, opts.dataUrl);
    }

    promise.then(function (rows) {
      if (!rows.length) {
        showError(body, "No short interest data available for " + ticker + ".");
        return;
      }
      body.innerHTML = '<canvas id="' + id + '-canvas"></canvas>';
      var canvas = document.getElementById(id + "-canvas");
      chartRef.instance = buildChart(canvas, rows, ticker);
    }).catch(function (err) {
      showError(body, "Failed to load short interest for " + ticker + ": " + err.message);
    });

    return chartRef;
  }

  global.ShortInterestChart = { render: render, version: "1.0.0" };
})(window);
