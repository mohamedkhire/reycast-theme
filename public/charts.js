(function () {
  var COLORS = ["#FF6363", "#FFB086", "#D4D4D4"];
  var FILLS = [
    ["rgba(255, 99, 99, 0.30)", "rgba(255, 99, 99, 0)"],
    ["rgba(255, 176, 134, 0.22)", "rgba(255, 176, 134, 0)"],
    ["rgba(255, 255, 255, 0.14)", "rgba(255, 255, 255, 0)"],
  ];
  var patched = typeof WeakSet === "function" ? new WeakSet() : null;
  var seen = [];

  function mark(chart) {
    if (patched) {
      if (patched.has(chart)) return true;
      patched.add(chart);
      return false;
    }
    if (seen.indexOf(chart) !== -1) return true;
    seen.push(chart);
    return false;
  }

  function datasetsOf(chart) {
    if (chart.data && chart.data.datasets) return chart.data.datasets;
    if (chart.config && chart.config.data && chart.config.data.datasets) return chart.config.data.datasets;
    return [];
  }

  function gradient(chart, index) {
    var ctx = chart.ctx || (chart.chart && chart.chart.ctx);
    if (!ctx || typeof ctx.createLinearGradient !== "function") {
      return FILLS[index % FILLS.length][0];
    }
    var area = chart.chartArea || { top: 0, bottom: chart.height || 120 };
    var top = area.top || 0;
    var bottom = area.bottom || chart.height || 120;
    if (bottom <= top) bottom = top + 120;
    var g = ctx.createLinearGradient(0, top, 0, bottom);
    var stops = FILLS[index % FILLS.length];
    g.addColorStop(0, stops[0]);
    g.addColorStop(1, stops[1]);
    return g;
  }

  function restyle(chart) {
    if (!chart || !chart.options) return;

    chart.options.animation = false;
    chart.options.elements = chart.options.elements || {};
    chart.options.elements.line = Object.assign({}, chart.options.elements.line, {
      tension: 0.42,
      borderWidth: 2.4,
      borderJoinStyle: "round",
      capBezierPoints: true,
    });
    chart.options.elements.point = Object.assign({}, chart.options.elements.point, {
      radius: 0,
      hoverRadius: 4,
      hoverBorderWidth: 2,
      hitRadius: 10,
    });

    var scales = chart.options.scales || {};
    ["x", "y", "xAxes", "yAxes"].forEach(function (key) {
      var scale = scales[key];
      if (!scale) return;
      var list = Array.isArray(scale) ? scale : [scale];
      list.forEach(function (s) {
        s.grid = Object.assign({}, s.grid, {
          color: "rgba(255,255,255,0.055)",
          borderColor: "transparent",
          drawBorder: false,
          tickLength: 0,
        });
        s.gridLines = Object.assign({}, s.gridLines, {
          color: "rgba(255,255,255,0.055)",
          zeroLineColor: "transparent",
          drawBorder: false,
        });
        s.ticks = Object.assign({}, s.ticks, {
          color: "#8a8a8a",
          fontColor: "#8a8a8a",
          padding: 8,
          font: { size: 11, family: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif' },
        });
      });
    });

    chart.options.plugins = chart.options.plugins || {};
    chart.options.plugins.legend = Object.assign({}, chart.options.plugins.legend, { display: false });
    chart.options.plugins.tooltip = Object.assign({}, chart.options.plugins.tooltip, {
      enabled: true,
      backgroundColor: "rgba(22, 22, 22, 0.94)",
      titleColor: "#f2f2f2",
      bodyColor: "#c6c6c6",
      borderColor: "rgba(255,255,255,0.1)",
      borderWidth: 1,
      padding: 10,
      cornerRadius: 8,
      displayColors: true,
      boxPadding: 4,
    });
    chart.options.tooltips = Object.assign({}, chart.options.tooltips, {
      enabled: true,
      backgroundColor: "rgba(22, 22, 22, 0.94)",
      titleFontColor: "#f2f2f2",
      bodyFontColor: "#c6c6c6",
      borderColor: "rgba(255,255,255,0.1)",
      borderWidth: 1,
      xPadding: 10,
      yPadding: 10,
      cornerRadius: 8,
    });
    chart.options.legend = Object.assign({}, chart.options.legend, { display: false });

    datasetsOf(chart).forEach(function (ds, i) {
      ds.borderColor = COLORS[i % COLORS.length];
      ds.backgroundColor = gradient(chart, i);
      ds.fill = true;
      ds.pointBackgroundColor = COLORS[i % COLORS.length];
      ds.pointBorderColor = "#0d0d0d";
      ds.pointRadius = 0;
      ds.pointHoverRadius = 4;
      ds.borderWidth = 2.4;
      ds.lineTension = 0.42;
    });
  }

  function fiber(el) {
    var key = Object.keys(el).find(function (k) {
      return k.indexOf("__reactFiber$") === 0 || k.indexOf("__reactInternalInstance$") === 0;
    });
    return key ? el[key] : null;
  }

  function fromCanvas(canvas) {
    if (window.Chart && typeof window.Chart.getChart === "function") {
      var direct = window.Chart.getChart(canvas);
      if (direct) return direct;
    }
    if (canvas.chart && canvas.chart.data) return canvas.chart;
    var node = fiber(canvas);
    var depth = 0;
    while (node && depth < 60) {
      var state = node.stateNode;
      if (state) {
        if (state.config && state.data && typeof state.update === "function") return state;
        if (state.chart && state.chart.data && typeof state.chart.update === "function") return state.chart;
      }
      node = node.return;
      depth += 1;
    }
    var ctx = canvas.getContext && canvas.getContext("2d");
    if (ctx && ctx.$chartjs && ctx.$chartjs.chart) return ctx.$chartjs.chart;
    if (window.Chart && window.Chart.instances) {
      var instances = window.Chart.instances;
      var keys = Object.keys(instances);
      for (var i = 0; i < keys.length; i += 1) {
        var inst = instances[keys[i]];
        if (inst && (inst.canvas === canvas || (inst.chart && inst.chart.canvas === canvas))) {
          return inst.chart || inst;
        }
      }
    }
    return null;
  }

  function patchClass(ChartClass) {
    if (!ChartClass || !ChartClass.prototype || ChartClass.__relisysPatched) return;
    ChartClass.__relisysPatched = true;
    var original = ChartClass.prototype.update;
    ChartClass.prototype.update = function () {
      try {
        restyle(this);
      } catch (e) {}
      return original.apply(this, arguments);
    };
  }

  function scan() {
    document.querySelectorAll("canvas").forEach(function (canvas) {
      var chart = fromCanvas(canvas);
      if (!chart) return;
      patchClass(chart.constructor);
      if (mark(chart)) return;
      try {
        restyle(chart);
        if (typeof chart.update === "function") chart.update("none");
      } catch (e) {}
    });
  }

  if (window.Chart) {
    patchClass(window.Chart);
    if (window.Chart.defaults) {
      window.Chart.defaults.color = "#8a8a8a";
      window.Chart.defaults.borderColor = "rgba(255,255,255,0.06)";
      if (window.Chart.defaults.global) {
        window.Chart.defaults.global.defaultFontColor = "#8a8a8a";
        window.Chart.defaults.global.elements = window.Chart.defaults.global.elements || {};
        window.Chart.defaults.global.elements.line = Object.assign(
          {},
          window.Chart.defaults.global.elements.line,
          { tension: 0.42, borderWidth: 2.4 }
        );
      }
      if (window.Chart.defaults.elements && window.Chart.defaults.elements.line) {
        window.Chart.defaults.elements.line.tension = 0.42;
        window.Chart.defaults.elements.line.borderWidth = 2.4;
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scan);
  } else {
    scan();
  }

  setInterval(scan, 3000);

  function scheduleScan() {
    if (scheduleScan.timer) clearTimeout(scheduleScan.timer);
    scheduleScan.timer = setTimeout(function () {
      scheduleScan.timer = null;
      scan();
    }, 400);
  }

  function nodeHasCanvas(node) {
    if (!node || node.nodeType !== 1) return false;
    if (node.tagName === "CANVAS") return true;
    return typeof node.querySelector === "function" && !!node.querySelector("canvas");
  }

  if (typeof MutationObserver !== "undefined") {
    new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i += 1) {
        var added = mutations[i].addedNodes;
        if (!added) continue;
        for (var j = 0; j < added.length; j += 1) {
          if (nodeHasCanvas(added[j])) {
            scheduleScan();
            return;
          }
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
})();
