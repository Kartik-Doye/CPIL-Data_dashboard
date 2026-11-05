// charts.js — ECharts helpers for the dashboard
// Indian number formatting in axis labels, area charts with dot+value,
// horizontal bar rankings, tooltips with definitions.

// --- Dark mode theme for ECharts ---
if (typeof echarts !== 'undefined') {
    echarts.registerTheme('dark', {
        backgroundColor: 'transparent',
        textStyle: { color: '#e2e8f0', fontFamily: 'Segoe UI, Roboto, sans-serif' },
        title: { textStyle: { color: '#e2e8f0' } },
        legend: { textStyle: { color: '#94a3b8' } },
        xAxis: { axisLine: { lineStyle: { color: '#3d4451' } },
                  axisLabel: { color: '#94a3b8' },
                  splitLine: { lineStyle: { color: '#2d3340' } },
                  nameTextStyle: { color: '#94a3b8' } },
        yAxis: { axisLine: { lineStyle: { color: '#3d4451' } },
                  axisLabel: { color: '#94a3b8' },
                  splitLine: { lineStyle: { color: '#2d3340' } },
                  nameTextStyle: { color: '#94a3b8' } },
        tooltip: { backgroundColor: 'rgba(30,33,40,0.95)', textStyle: { color: '#e2e8f0' } },
    });
}
var darkChartTheme = {
    backgroundColor: 'transparent',
    textStyle: { color: '#e2e8f0' },
    title: { textStyle: { color: '#e2e8f0' } },
    legend: { textStyle: { color: '#94a3b8' } },
    xAxis: { axisLine: { lineStyle: { color: '#3d4451' } },
              axisLabel: { color: '#94a3b8' },
              splitLine: { lineStyle: { color: '#2d3340' } },
              nameTextStyle: { color: '#94a3b8' } },
    yAxis: { axisLine: { lineStyle: { color: '#3d4451' } },
              axisLabel: { color: '#94a3b8' },
              splitLine: { lineStyle: { color: '#2d3340' } },
              nameTextStyle: { color: '#94a3b8' } },
};

// Check if dark mode is active
function isDarkMode() {
    return document.body.classList.contains('dark-theme');
}

// Get theme-aware defaults
function getThemeDefaults() {
    var defaults = Object.assign({}, chartDefaults);
    if (isDarkMode()) {
        defaults = Object.assign(defaults, darkChartTheme);
    }
    return defaults;
}

// Show error message in chart container
function showChartError(domId, msg) {
    var dom = document.getElementById(domId);
    if (!dom) return;
    dom.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted,#78909c);font-size:13px;text-align:center;">' +
        '<div><i class="fas fa-exclamation-circle" style="font-size:24px;margin-bottom:8px;display:block;"></i>' +
        (msg || 'Chart unavailable') + '</div></div>';
}

// Safe chart init with error handling
function safeChartInit(domId) {
    var dom = document.getElementById(domId);
    if (!dom) return null;
    if (typeof echarts === 'undefined') {
        showChartError(domId, 'Chart library failed to load');
        return null;
    }
    try {
        return echarts.init(dom, isDarkMode() ? 'dark' : null);
    } catch (e) {
        showChartError(domId, 'Chart initialization failed');
        return null;
    }
}

// Indian number formatter for ECharts
function formatIndian(value, decimals) {
    decimals = decimals || 0;
    if (value === null || value === undefined || isNaN(value)) return 'n/a';
    var neg = value < 0;
    value = Math.abs(value);
    var s = value.toFixed(decimals);
    var parts = s.split('.');
    var intPart = parts[0];
    var decPart = parts[1] || '';

    if (intPart.length > 3) {
        var last3 = intPart.slice(-3);
        var rest = intPart.slice(0, -3);
        var groups = [];
        while (rest.length > 2) {
            groups.unshift(rest.slice(-2));
            rest = rest.slice(0, -2);
        }
        if (rest) groups.unshift(rest);
        intPart = groups.join(',') + ',' + last3;
    }
    var result = intPart + (decPart ? '.' + decPart : '');
    return neg ? '-' + result : result;
}

// Default ECharts theme settings
// Replace null/undefined/NaN with 0 for safe chart rendering
function cleanData(arr) {
    return arr.map(function(v) {
        if (v === null || v === undefined || (typeof v === 'number' && isNaN(v))) return 0;
        return v;
    });
}

var chartDefaults = {
    textStyle: { fontFamily: 'Segoe UI, Roboto, sans-serif', fontSize: 12 },
    color: ['#17a2b8', '#28a745', '#ffc107', '#dc3545', '#6f42c1',
            '#fd7e14', '#20c997', '#007bff'],
    tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
    },
    grid: { left: 60, right: 30, top: 30, bottom: 50, containLabel: true },
    toolbox: {
        right: 8,
        feature: {
            saveAsImage: { title: 'Save as PNG', iconStyle: { opacity: 0.6 } }
        }
    },
};

// Create an area (line) chart with dot + value labels
function makeAreaChart(domId, categories, series, opts) {
    opts = opts || {};
    var dom = document.getElementById(domId);
    if (!dom) return;
    try {
    var chart = safeChartInit(domId);
    if (!chart) return;
    chart.setOption(Object.assign({}, getThemeDefaults(), {
        tooltip: { trigger: 'axis' },
        xAxis: {
            type: 'category',
            data: categories,
            boundaryGap: false,
            name: opts.xName || 'Date',
            nameLocation: 'middle',
            nameGap: 30,
            axisLabel: { fontSize: 11, rotate: categories.length > 10 ? 30 : 0 },
        },
        yAxis: {
            type: 'value',
            name: opts.yName || 'Sale (L)',
            nameLocation: 'middle',
            nameGap: 40,
            axisLabel: {
                formatter: function(v) { return formatIndian(v, 0); },
                fontSize: 11,
            },
        },
        series: series.map(function(s, i) {
            return {
                name: s.name,
                type: 'line',
                data: s.data,
                smooth: true,
                symbol: 'circle',
                symbolSize: 6,
                label: {
                    show: opts.showLabels !== false,
                    position: 'top',
                    formatter: function(p) {
                        return formatIndian(p.value, opts.decimals || 0);
                    },
                    fontSize: 10,
                },
                lineStyle: s.dashed ? { type: 'dashed' } : { width: 2 },
                areaStyle: s.area ? { opacity: 0.15 } : undefined,
                color: s.color || chartDefaults.color[i],
            };
        }),
        legend: series.length > 1 ? { bottom: 0, fontSize: 11 } : undefined,
    }));
    window.addEventListener('resize', function() { chart.resize(); });
    return chart;
    } catch (e) { showChartError(domId); console.error('makeAreaChart:', e); }
}

// Create a horizontal bar chart (for rankings)
function makeBarChart(domId, labels, values, opts) {
    opts = opts || {};
    var dom = document.getElementById(domId);
    if (!dom) return;
    try {
    values = cleanData(values);
    var chart = safeChartInit(domId);
    if (!chart) return;
    // Reverse for top-to-bottom ranking
    labels = labels.slice().reverse();
    values = values.slice().reverse();
    chart.setOption(Object.assign({}, getThemeDefaults(), {
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
            formatter: function(params) {
                var p = params[0];
                var val = formatIndian(p.value, opts.decimals || 0);
                return p.name + ': ' + val + (opts.unit || '');
            },
        },
        xAxis: {
            type: 'value',
            name: opts.xName || (opts.unit || 'Value'),
            nameLocation: 'middle',
            nameGap: 30,
            axisLabel: {
                formatter: function(v) { return formatIndian(v, 0); },
                fontSize: 11,
            },
        },
        yAxis: {
            type: 'category',
            data: labels,
            name: opts.yName || 'Station',
            nameLocation: 'middle',
            nameGap: 60,
            axisLabel: { fontSize: 11 },
        },
        series: [{
            type: 'bar',
            data: values,
            barMaxWidth: 24,
            itemStyle: { borderRadius: [0, 4, 4, 0] },
            label: {
                show: true,
                position: 'right',
                formatter: function(p) {
                    return formatIndian(p.value, opts.decimals || 0) + (opts.unit || '');
                },
                fontSize: 10,
            },
        }],
    }));
    window.addEventListener('resize', function() { chart.resize(); });
    return chart;
    } catch (e) { showChartError(domId); console.error('makeBarChart:', e); }
}

// Create a grouped bar chart (multiple series)
function makeGroupedBar(domId, categories, series, opts) {
    opts = opts || {};
    var dom = document.getElementById(domId);
    if (!dom) return;
    try {
    series.forEach(function(s) { s.data = cleanData(s.data); });
    var chart = safeChartInit(domId);
    if (!chart) return;
    chart.setOption(Object.assign({}, getThemeDefaults(), {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        legend: { bottom: 0, fontSize: 11 },
        xAxis: {
            type: 'category',
            data: categories,
            name: opts.xName || 'Category',
            nameLocation: 'middle',
            nameGap: 30,
            axisLabel: { fontSize: 11, rotate: categories.length > 6 ? 30 : 0 },
        },
        yAxis: {
            type: 'value',
            name: opts.yName || 'Value',
            nameLocation: 'middle',
            nameGap: 40,
            axisLabel: {
                formatter: function(v) { return formatIndian(v, 0); },
                fontSize: 11,
            },
        },
        series: series.map(function(s, i) {
            return {
                name: s.name,
                type: 'bar',
                data: s.data,
                barMaxWidth: 20,
                itemStyle: { borderRadius: [4, 4, 0, 0] },
                color: s.color || chartDefaults.color[i],
            };
        }),
    }));
    window.addEventListener('resize', function() { chart.resize(); });
    return chart;
    } catch (e) { showChartError(domId); console.error('makeGroupedBar:', e); }
}

// =========================================================================
// Professional chart additions for the Master Dashboard (7 analytics)
// =========================================================================

// Dual-axis area+line chart: volume (L) on left axis, collection (₹) on right.
// Used for Analytic 2: Daily Sales Trend.
function makeDualAxisChart(domId, categories, volumeData, collectionData) {
    var dom = document.getElementById(domId);
    if (!dom) return;
    try {
    volumeData = cleanData(volumeData);
    collectionData = cleanData(collectionData);
    var chart = safeChartInit(domId);
    if (!chart) return;
    chart.setOption(Object.assign({}, getThemeDefaults(), {
        tooltip: {
            trigger: 'axis',
            formatter: function(params) {
                var html = params[0].axisValueLabel + '<br/>';
                params.forEach(function(p) {
                    var val = formatIndian(p.value, 0);
                    var unit = p.seriesName === 'Collection' ? ' ₹' : ' L';
                    html += p.marker + ' ' + p.seriesName + ': ' + val + unit + '<br/>';
                });
                return html;
            }
        },
        legend: { bottom: 0, fontSize: 11 },
        grid: { left: 60, right: 60, top: 30, bottom: 80, containLabel: true },
        xAxis: {
            type: 'category',
            data: categories,
            boundaryGap: false,
            name: 'Date',
            nameLocation: 'middle',
            nameGap: 30,
            axisLabel: { fontSize: 10, rotate: categories.length > 10 ? 35 : 0 },
        },
        yAxis: [
            {
                type: 'value',
                name: 'Sale (L)',
                position: 'left',
                axisLabel: { formatter: function(v) { return formatIndian(v, 0); }, fontSize: 10 },
                splitLine: { lineStyle: { type: 'dashed', opacity: 0.3 } },
            },
            {
                type: 'value',
                name: 'Collection (₹)',
                position: 'right',
                axisLabel: { formatter: function(v) {
                    if (v >= 10000000) return (v/10000000).toFixed(1) + 'Cr';
                    if (v >= 100000) return (v/100000).toFixed(1) + 'L';
                    if (v >= 1000) return (v/1000).toFixed(0) + 'K';
                    return v;
                }, fontSize: 10 },
                splitLine: { show: false },
            }
        ],
        dataZoom: [{ type: 'inside' }, { type: 'slider', height: 18, bottom: 24 }],
        series: [
            {
                name: 'Sale Volume',
                type: 'line',
                data: volumeData,
                smooth: true,
                symbol: 'circle',
                symbolSize: 5,
                lineStyle: { width: 2.5 },
                areaStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: 'rgba(23,162,184,0.35)' },
                        { offset: 1, color: 'rgba(23,162,184,0.02)' },
                    ])
                },
                itemStyle: { color: '#17a2b8' },
            },
            {
                name: 'Collection',
                type: 'line',
                yAxisIndex: 1,
                data: collectionData,
                smooth: true,
                symbol: 'none',
                lineStyle: { width: 2, color: '#28a745' },
                itemStyle: { color: '#28a745' },
            }
        ],
    }));
    window.addEventListener('resize', function() { chart.resize(); });
    return chart;
    } catch (e) { showChartError(domId); console.error('makeDualAxisChart:', e); }
}

// Donut chart for Analytic 4: Product Type Mix (LOCO/JODO/DODO).
function makeDonutChart(domId, labels, values, opts) {
    opts = opts || {};
    var dom = document.getElementById(domId);
    if (!dom) return;
    try {
    values = cleanData(values);
    var chart = safeChartInit(domId);
    if (!chart) return;
    var total = values.reduce(function(a, b) { return a + (b || 0); }, 0);
    chart.setOption(Object.assign({}, getThemeDefaults(), {
        tooltip: {
            trigger: 'item',
            formatter: function(p) {
                var pct = total ? (p.value / total * 100).toFixed(1) : '0.0';
                return p.name + ': ' + formatIndian(p.value, 0) + (opts.unit || '') + ' (' + pct + '%)';
            }
        },
        legend: { bottom: 0, fontSize: 11 },
        series: [{
            type: 'pie',
            radius: ['45%', '72%'],
            center: ['50%', '45%'],
            avoidLabelOverlap: true,
            itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
            label: {
                show: true,
                formatter: function(p) {
                    var pct = total ? (p.value / total * 100).toFixed(1) : '0.0';
                    return pct + '%';
                },
                fontSize: 11, fontWeight: 'bold',
            },
            emphasis: {
                label: { show: true, fontSize: 14, fontWeight: 'bold' },
                itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.2)' }
            },
            data: labels.map(function(l, i) {
                return { name: l, value: values[i] || 0 };
            }),
        }],
        graphic: [{
            type: 'text', left: 'center', top: '38%',
            style: {
                text: 'Total',
                fontSize: 12, fill: '#888', textAlign: 'center',
            }
        }, {
            type: 'text', left: 'center', top: '46%',
            style: {
                text: formatIndian(total, 0) + (opts.unit || ''),
                fontSize: 16, fontWeight: 'bold', fill: '#333', textAlign: 'center',
            }
        }],
    }));
    window.addEventListener('resize', function() { chart.resize(); });
    return chart;
    } catch (e) { showChartError(domId); console.error('makeDonutChart:', e); }
}

// Stacked bar chart for Analytic 5: Collection Composition.
// categories = dates, series = [{name, data, color}, ...]
function makeStackedBar(domId, categories, series, opts) {
    opts = opts || {};
    var dom = document.getElementById(domId);
    if (!dom) return;
    try {
    series.forEach(function(s) { s.data = cleanData(s.data); });
    var chart = safeChartInit(domId);
    if (!chart) return;
    chart.setOption(Object.assign({}, getThemeDefaults(), {
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
            formatter: function(params) {
                var html = params[0].axisValueLabel + '<br/>';
                var sum = 0;
                params.forEach(function(p) {
                    sum += p.value;
                    html += p.marker + ' ' + p.seriesName + ': ' + formatIndian(p.value, 0) + (opts.unit || ' ₹') + '<br/>';
                });
                html += '<b>Total: ' + formatIndian(sum, 0) + (opts.unit || ' ₹') + '</b>';
                return html;
            }
        },
        legend: { bottom: 0, fontSize: 11 },
        grid: { left: 60, right: 30, top: 30, bottom: 80, containLabel: true },
        xAxis: {
            type: 'category',
            data: categories,
            name: opts.xName || 'Date',
            nameLocation: 'middle',
            nameGap: 30,
            axisLabel: { fontSize: 10, rotate: categories.length > 8 ? 35 : 0 },
        },
        yAxis: {
            type: 'value',
            name: opts.yName || 'Collection (₹)',
            nameLocation: 'middle',
            nameGap: 50,
            axisLabel: {
                formatter: function(v) {
                    if (v >= 10000000) return (v/10000000).toFixed(1) + 'Cr';
                    if (v >= 100000) return (v/100000).toFixed(1) + 'L';
                    if (v >= 1000) return (v/1000).toFixed(0) + 'K';
                    return v;
                },
                fontSize: 10,
            },
        },
        dataZoom: [{ type: 'inside' }, { type: 'slider', height: 16, bottom: 24 }],
        series: series.map(function(s, i) {
            return {
                name: s.name,
                type: 'bar',
                stack: 'total',
                data: s.data,
                barMaxWidth: 32,
                itemStyle: { borderRadius: i === series.length - 1 ? [4,4,0,0] : [0,0,0,0] },
                color: s.color || chartDefaults.color[i],
                emphasis: { focus: 'series' },
            };
        }),
    }));
    window.addEventListener('resize', function() { chart.resize(); });
    return chart;
    } catch (e) { showChartError(domId); console.error('makeStackedBar:', e); }
}

// Histogram for Analytic 6: Station Performance Distribution.
function makeHistogram(domId, labels, counts, opts) {
    opts = opts || {};
    var dom = document.getElementById(domId);
    if (!dom) return;
    try {
    var chart = safeChartInit(domId);
    if (!chart) return;
    chart.setOption(Object.assign({}, getThemeDefaults(), {
        tooltip: {
            trigger: 'axis',
            formatter: function(params) {
                var p = params[0];
                return p.name + '<br/>Stations: ' + formatIndian(p.value, 0);
            }
        },
        grid: { left: 60, right: 30, top: 30, bottom: 60, containLabel: true },
        xAxis: {
            type: 'category',
            data: labels,
            axisLabel: { fontSize: 10 },
            name: 'Sale (L)',
            nameLocation: 'middle',
            nameGap: 28,
        },
        yAxis: {
            type: 'value',
            name: 'Stations',
            axisLabel: { formatter: function(v) { return formatIndian(v, 0); }, fontSize: 10 },
            splitLine: { lineStyle: { type: 'dashed', opacity: 0.3 } },
        },
        series: [{
            type: 'bar',
            data: counts.map(function(c, i) {
                var ratio = counts.length > 1 ? i / (counts.length - 1) : 0;
                var color;
                if (ratio < 0.33) color = '#dc3545';
                else if (ratio < 0.66) color = '#ffc107';
                else color = '#28a745';
                return { value: c, itemStyle: { color: color, borderRadius: [4,4,0,0] } };
            }),
            barMaxWidth: 48,
            label: {
                show: true,
                position: 'top',
                formatter: function(p) { return formatIndian(p.value, 0); },
                fontSize: 10,
            },
        }],
    }));
    window.addEventListener('resize', function() { chart.resize(); });
    return chart;
    } catch (e) { showChartError(domId); console.error('makeHistogram:', e); }
}

// Gauge for Analytic 7: Data Completeness.
function makeGauge(domId, pct, opts) {
    opts = opts || {};
    var dom = document.getElementById(domId);
    if (!dom) return;
    try {
    var chart = safeChartInit(domId);
    if (!chart) return;
    var color = pct >= 90 ? '#28a745' : (pct >= 60 ? '#ffc107' : '#dc3545');
    chart.setOption({
        textStyle: chartDefaults.textStyle,
        series: [{
            type: 'gauge',
            startAngle: 200,
            endAngle: -20,
            min: 0,
            max: 100,
            radius: '90%',
            center: ['50%', '55%'],
            progress: {
                show: true,
                width: 14,
                itemStyle: { color: color },
            },
            axisLine: {
                lineStyle: { width: 14, color: [[1, '#e9ecef']] }
            },
            pointer: { show: false },
            axisTick: { show: false },
            splitLine: { show: false },
            axisLabel: { show: false },
            detail: {
                valueAnimation: true,
                formatter: '{value}%',
                fontSize: 22,
                fontWeight: 'bold',
                color: color,
                offsetCenter: [0, '10%'],
            },
            title: {
                offsetCenter: [0, '40%'],
                fontSize: 11,
                color: '#888',
            },
            data: [{ value: pct, name: opts.label || 'Data Loaded' }],
        }],
    });
    window.addEventListener('resize', function() { chart.resize(); });
    return chart;
    } catch (e) { showChartError(domId); console.error('makeGauge:', e); }
}

// Mini sparkline for exception trend (no axes, no labels).
function makeSparkline(domId, values, color) {
    var dom = document.getElementById(domId);
    if (!dom) return;
    try {
    var chart = safeChartInit(domId);
    if (!chart) return;
    var lineColor = color || '#dc3545';
    // Convert hex color to rgba for area fill
    var r = parseInt(lineColor.slice(1,3), 16);
    var g = parseInt(lineColor.slice(3,5), 16);
    var b = parseInt(lineColor.slice(5,7), 16);
    chart.setOption({
        textStyle: chartDefaults.textStyle,
        grid: { left: 0, right: 0, top: 4, bottom: 0 },
        xAxis: { type: 'category', show: false, boundaryGap: false, data: values.map(function(_, i) { return i; }) },
        yAxis: { type: 'value', show: false },
        tooltip: { show: false },
        series: [{
            type: 'line',
            data: values,
            smooth: true,
            symbol: 'none',
            lineStyle: { width: 2, color: lineColor },
            areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: 'rgba(' + r + ',' + g + ',' + b + ',0.25)' },
                    { offset: 1, color: 'rgba(' + r + ',' + g + ',' + b + ',0.01)' },
                ])
            },
        }],
    });
    window.addEventListener('resize', function() { chart.resize(); });
    return chart;
    } catch (e) { showChartError(domId); console.error('makeSparkline:', e); }
}

// =========================================================================
// Forecast chart functions (Report 23: AI/ML Prediction)
// =========================================================================

// Multi-model forecast chart: historical actuals + 4 model predictions + confidence band + MA7.
// series = { actual, ma7, linear, holtWinters, knn, ensemble, lowerBase, bandWidth }
function makeMultiModelForecastChart(domId, categories, series) {
    var dom = document.getElementById(domId);
    if (!dom) return;
    try {
    var chart = safeChartInit(domId);
    if (!chart) return;

    chart.setOption(Object.assign({}, chartDefaults, {
        tooltip: {
            trigger: 'axis',
            formatter: function(params) {
                var html = params[0].axisValueLabel + '<br/>';
                params.forEach(function(p) {
                    if (p.value === null || p.value === undefined) return;
                    if (p.seriesName === 'Lower' || p.seriesName === 'Confidence Band') return;
                    html += p.marker + ' ' + p.seriesName + ': ' + formatIndian(p.value, 0) + ' L<br/>';
                });
                return html;
            }
        },
        legend: {
            bottom: 0,
            fontSize: 10,
            data: ['Actual', '7-Day MA', 'Linear', 'Holt-Winters', 'KNN', 'Ensemble', 'Confidence Band']
        },
        grid: { left: 60, right: 30, top: 30, bottom: 90, containLabel: true },
        xAxis: {
            type: 'category',
            data: categories,
            boundaryGap: false,
            name: 'Date',
            nameLocation: 'middle',
            nameGap: 30,
            axisLabel: { fontSize: 10, rotate: categories.length > 15 ? 35 : 0 },
        },
        yAxis: {
            type: 'value',
            name: 'Sale (L)',
            axisLabel: { formatter: function(v) { return formatIndian(v, 0); }, fontSize: 10 },
            splitLine: { lineStyle: { type: 'dashed', opacity: 0.3 } },
        },
        dataZoom: [{ type: 'inside' }, { type: 'slider', height: 20, bottom: 28 }],
        series: [
            // Confidence band: transparent base + stacked width
            {
                name: 'Lower',
                type: 'line',
                data: series.lowerBase,
                stack: 'band',
                symbol: 'none',
                lineStyle: { width: 0, opacity: 0 },
                showInLegend: false,
                tooltip: { show: false },
                z: 1,
            },
            {
                name: 'Confidence Band',
                type: 'line',
                data: series.bandWidth,
                stack: 'band',
                symbol: 'none',
                lineStyle: { width: 0, opacity: 0 },
                areaStyle: { color: 'rgba(111, 66, 193, 0.12)' },
                z: 1,
            },
            // Historical actuals — solid blue with area gradient
            {
                name: 'Actual',
                type: 'line',
                data: series.actual,
                smooth: true,
                symbol: 'none',
                lineStyle: { width: 2.5, color: '#17a2b8' },
                itemStyle: { color: '#17a2b8' },
                areaStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: 'rgba(23,162,184,0.25)' },
                        { offset: 1, color: 'rgba(23,162,184,0.01)' },
                    ])
                },
                z: 3,
            },
            // 7-day moving average — orange, thin
            {
                name: '7-Day MA',
                type: 'line',
                data: series.ma7,
                smooth: true,
                symbol: 'none',
                lineStyle: { width: 1.5, color: '#ff9800', opacity: 0.7 },
                itemStyle: { color: '#ff9800' },
                z: 2,
            },
            // Linear Regression — blue dashed, thin
            {
                name: 'Linear',
                type: 'line',
                data: series.linear,
                smooth: true,
                symbol: 'none',
                lineStyle: { width: 1.5, color: '#007bff', type: 'dashed', opacity: 0.7 },
                itemStyle: { color: '#007bff' },
                z: 4,
            },
            // Holt-Winters — purple dashed, thin
            {
                name: 'Holt-Winters',
                type: 'line',
                data: series.holtWinters,
                smooth: true,
                symbol: 'none',
                lineStyle: { width: 1.5, color: '#6f42c1', type: 'dashed', opacity: 0.7 },
                itemStyle: { color: '#6f42c1' },
                z: 4,
            },
            // KNN — amber dashed, thin
            {
                name: 'KNN',
                type: 'line',
                data: series.knn,
                smooth: true,
                symbol: 'none',
                lineStyle: { width: 1.5, color: '#fd7e14', type: 'dashed', opacity: 0.7 },
                itemStyle: { color: '#fd7e14' },
                z: 4,
            },
            // Ensemble — green solid, thick (the main prediction)
            {
                name: 'Ensemble',
                type: 'line',
                data: series.ensemble,
                smooth: true,
                symbol: 'circle',
                symbolSize: 6,
                lineStyle: { width: 3, color: '#28a745' },
                itemStyle: { color: '#28a745' },
                z: 5,
            },
        ],
    }));
    window.addEventListener('resize', function() { chart.resize(); });
    return chart;
    } catch (e) { showChartError(domId); console.error('makeMultiModelForecastChart:', e); }
}

// Weekday seasonal pattern: 7 bars showing % above/below average.
function makeWeekdayPattern(domId, labels, values) {
    var dom = document.getElementById(domId);
    if (!dom) return;
    try {
    var chart = safeChartInit(domId);
    if (!chart) return;

    chart.setOption(Object.assign({}, getThemeDefaults(), {
        tooltip: {
            trigger: 'axis',
            formatter: function(params) {
                var p = params[0];
                var direction = p.value >= 0 ? 'above' : 'below';
                return p.name + '<br/>' + Math.abs(p.value) + '% ' + direction + ' average';
            }
        },
        grid: { left: 60, right: 30, top: 30, bottom: 50, containLabel: true },
        xAxis: {
            type: 'category',
            data: labels,
            name: 'Day of Week',
            nameLocation: 'middle',
            nameGap: 30,
            axisLabel: { fontSize: 12, fontWeight: 'bold' },
        },
        yAxis: {
            type: 'value',
            name: '% vs Avg',
            axisLabel: { formatter: function(v) { return v + '%'; }, fontSize: 10 },
            splitLine: { lineStyle: { type: 'dashed', opacity: 0.3 } },
        },
        series: [{
            type: 'bar',
            data: values.map(function(v, i) {
                var isWeekend = i >= 5;
                var color = v >= 0 ? (isWeekend ? '#ff9800' : '#28a745') : '#dc3545';
                return { value: v, itemStyle: { color: color, borderRadius: [4,4,0,0] } };
            }),
            barMaxWidth: 50,
            label: {
                show: true,
                position: 'top',
                formatter: function(p) {
                    return (p.value >= 0 ? '+' : '') + p.value + '%';
                },
                fontSize: 11,
                fontWeight: 'bold',
            },
            markLine: {
                silent: true,
                symbol: 'none',
                data: [{ yAxis: 0 }],
                lineStyle: { color: '#999', type: 'solid', width: 1 },
                label: { show: false },
            },
        }],
    }));
    window.addEventListener('resize', function() { chart.resize(); });
    return chart;
    } catch (e) { showChartError(domId); console.error('makeWeekdayPattern:', e); }
}


// =========================================================================
// Line chart (simple single-series)
// =========================================================================
function makeLineChart(domId, categories, values, opts) {
    opts = opts || {};
    var dom = document.getElementById(domId);
    if (!dom) return;
    try {
    values = cleanData(values);
    var chart = safeChartInit(domId);
    if (!chart) return;
    var decimals = opts.decimals !== undefined ? opts.decimals : 2;
    var unit = opts.unit || '';
    chart.setOption({
        tooltip: { trigger: 'axis',
            formatter: function(params) {
                return params[0].name + ': ' + formatIndian(params[0].value, decimals) + unit;
            }},
        grid: { left: 60, right: 30, top: 30, bottom: 50, containLabel: true },
        xAxis: { type: 'category', data: categories,
            name: opts.xName || 'Date', nameLocation: 'middle', nameGap: 30,
            axisLabel: { fontSize: 11 } },
        yAxis: { type: 'value',
            name: opts.yName || 'Value', nameLocation: 'middle', nameGap: 40,
            axisLabel: { fontSize: 11,
            formatter: function(v){ return formatIndian(v, 0); } } },
        series: [{
            type: 'line',
            data: values,
            smooth: true,
            symbol: 'circle', symbolSize: 6,
            lineStyle: { width: 3, color: '#007bff' },
            itemStyle: { color: '#007bff' },
            areaStyle: { color: 'rgba(0,123,255,0.1)' },
        }],
    });
    window.addEventListener('resize', function() { chart.resize(); });
    return chart;
    } catch (e) { showChartError(domId); console.error('makeLineChart:', e); }
}

// =========================================================================
// Heatmap (for correlation matrix)
// =========================================================================
function makeHeatmap(domId, labels, matrix) {
    var dom = document.getElementById(domId);
    if (!dom) return;
    try {
    var chart = safeChartInit(domId);
    if (!chart) return;
    var data = [];
    for (var i = 0; i < labels.length; i++) {
        for (var j = 0; j < labels.length; j++) {
            data.push([j, i, matrix[i][j]]);
        }
    }
    chart.setOption({
        tooltip: {
            formatter: function(p) {
            return labels[p.data[1]] + ' vs ' + labels[p.data[0]] + ': ' + p.data[2].toFixed(3);
            }
        },
        grid: { left: 120, right: 40, top: 30, bottom: 80, containLabel: true },
        xAxis: { type: 'category', data: labels, splitArea: { show: true },
            name: 'Variable', nameLocation: 'middle', nameGap: 30,
            axisLabel: { fontSize: 11, rotate: 30 } },
        yAxis: { type: 'category', data: labels, splitArea: { show: true },
            name: 'Variable', nameLocation: 'middle', nameGap: 90,
            axisLabel: { fontSize: 11 } },
        visualMap: {
            min: -1, max: 1, calculable: true, orient: 'horizontal',
            left: 'center', bottom: 5,
            inRange: { color: ['#dc3545', '#fff', '#28a745'] },
        },
        series: [{
            type: 'heatmap', data: data,
            label: { show: true, fontSize: 10,
                formatter: function(p) { return p.data[2].toFixed(2); } },
            emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.5)' } },
        }],
    });
    window.addEventListener('resize', function() { chart.resize(); });
    return chart;
    } catch (e) { showChartError(domId); console.error('makeHeatmap:', e); }
}

