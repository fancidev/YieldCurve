'use strict';

namespace Demo {

	interface DataPoint {
		x: number;
		y: number;
	}

	interface InterpScheme {
		degree: int;
		conditions: { knotIndex: int, derivOrder: int, derivValue: number }[];
	}

	function getTermStructureChart(): CanvasJS.Chart {
		return $("#termStructureChart").CanvasJSChart();
	}

	function getBumpResponseChart(): CanvasJS.Chart {
		return $("#bumpResponseChart").CanvasJSChart();
	}

	const defaultDataPoints = [
		{ x: 0.25, y: 5.39 },
		{ x: 1, y: 5.39 },
		{ x: 2, y: 5.21 },
		{ x: 3, y: 5.16 },
		{ x: 4, y: 5.16 },
		{ x: 5, y: 5.18 },
		{ x: 7, y: 5.23 },
		{ x: 10, y: 5.29 },
		{ x: 30, y: 5.41 }
	];
		
	// Plot each row in the table as a series.
	export function drawBezierBasis(preset: InterpScheme): void {
		const chart = getBumpResponseChart();
		chart.options.data.length = 0; // clear existing series

		var xs = defaultDataPoints.map(p=> p.x);
		var xMin = xs[0];
		var xMax = xs[xs.length - 1];
		var spline = new BSpline(xs, preset.degree, true);

		var n = xs.length;
		var p = preset.degree;

		for (var i = 0; i < spline.basisCount(); i++) {
			var g = spline.basis(i, 0);
			var dataPoints: DataPoint[] = [];
			for (var t = xMin; t <= xMax; t += 1 / 32) {
				dataPoints.push({ x: t, y: g(t) });
			}
			chart.options.data.push({
				type: 'line',
				name: 'Basis_' + i,
				markerType: 'square',
				showInLegend: true,
				dataPoints: dataPoints
			});
		}
		chart.options.toolTip.shared = true;
		chart.render();
	}

	type NamedInterpScheme = InterpScheme & { name: string };

	export function drawYieldCurve(
		dataPoints: DataPoint[],
		modelTemplate: YieldCurveModelTemplate,
		plotInstrumentTemplate: InstrumentTemplate) {

		const n = dataPoints.length;
		const Instrument = Swap; // Fra;
		const instruments = new Array<Instrument>(n);
		const marketRates = new Array<number>(n);
		for (let i = 0; i < n; i++) {
			instruments[i] = new Instrument(dataPoints[i].x);
			marketRates[i] = dataPoints[i].y / 100;
		}

		// Build the yield curve.
		const usedInstruments = instruments.slice();
		const model = modelTemplate.createModel(usedInstruments);
		const usedMarketRates = marketRates.slice();
		for (let i = usedMarketRates.length - 1; i >= 0; i--) {
			if (usedInstruments.indexOf(instruments[i]) < 0)
				usedMarketRates.splice(i, 1);
		}
		const discount = fitYieldCurve(model, usedInstruments, usedMarketRates);
		
		// Display model info.
		if (model.info) {
			$('#debugOutput').html(model.info());
			//$('#bumpResponseChart').css('display', 'none');
		}
		
		// Plot it...
		const chart = getTermStructureChart();
		chart.options.data.length = 0; // clear existing series
		
		// Plot input data points.
		if (true) {
			chart.options.data.push({
				type: 'scatter',
				name: 'Term structure',
				markerType: 'square',
				showInLegend: true,
				dataPoints: dataPoints
			});
		}
		
		// Plot interpolated curve.
		// const PlotInstrument = Swap; // InstFwd; // LogDf; // Swap; // LogDf;
		const interpolatedPoints: DataPoint[] = [];
		for (let t = 1 / 16; t <= dataPoints[n - 1].x; t += 1 / 16) {
			const instrument = plotInstrumentTemplate.createInstrument(t);
			const impliedRate = instrument.impliedRate(discount);
			interpolatedPoints.push({ x: t, y: impliedRate * 100 });
		}
		chart.options.data.push({
			type: 'line',
			name: plotInstrumentTemplate.name + ' Curve (' + modelTemplate.name + ')',
			markerType: 'none',
			showInLegend: true,
			dataPoints: interpolatedPoints
		});

		adjustYAxisLimits(chart);
		chart.render();
	}

	export function drawBumpResponse(
		dataPoints: DataPoint[],
		modelTemplate: YieldCurveModelTemplate,
		plotInstrumentTemplate: InstrumentTemplate) {

		const chart = getBumpResponseChart();
		chart.options.data.length = 0;

		const MarkInstrument = Swap;
		
		// Create instruments.
		const n = dataPoints.length;
		const instruments: Instrument[] = [];
		const marketRates: number[] = [];
		for (let i = 0; i < n; i++) {
			instruments[i] = new MarkInstrument(dataPoints[i].x);
			marketRates[i] = dataPoints[i].y / 100;
		}

		// Build the yield curve.
		const usedInstruments = instruments.slice();
		const model = modelTemplate.createModel(usedInstruments);
		const usedMarketRates = marketRates.slice();
		for (let i = usedMarketRates.length - 1; i >= 0; i--) {
			if (usedInstruments.indexOf(instruments[i]) < 0)
				usedMarketRates.splice(i, 1);
		}
		const baseCurve = fitYieldCurve(model, usedInstruments, usedMarketRates);

		// Create plot instruments.
		const plotInstruments = new Array<Instrument>();
		const step_t = (t: number) => t < 1 ? 1 / 16 : t < 5 ? 1 / 4 : t < 10 ? 1 / 2 : 1;
		for (let t = step_t(0); t <= dataPoints[n - 1].x; t += step_t(t)) {
			const instrument = plotInstrumentTemplate.createInstrument(t);
			plotInstruments.push(instrument);
		}
		
		// Make base output curve.
		let baseOutput = new Array<number>();
		for (const instrument of plotInstruments) {
			const impliedRate = instrument.impliedRate(baseCurve);
			baseOutput.push(impliedRate);
		}
		
		// Bump each marking input and rebuild the curve.
		for (let i = 0; i < usedInstruments.length; i++) {
			const bumpedMarketRates = usedMarketRates.slice();
			bumpedMarketRates[i] += 0.001; // 10 bp
			// Uncomment the following to start from a fresh state.
			// Leave it commented to start from the previously-fitted
			// state. Usually this doesn't make a difference, but
			// n-factor Vasicek fails to fit for some bumps under either
			// methods.
			// const model = modelTemplate.createModel(usedInstruments);
			const bumpedCurve = fitYieldCurve(model, usedInstruments, bumpedMarketRates);
			let bumpedOutput = new Array<number>();
			for (const instrument of plotInstruments) {
				const impliedRate = instrument.impliedRate(bumpedCurve);
				bumpedOutput.push(impliedRate);
			}

			const diff = numeric.sub(bumpedOutput, baseOutput);
			numeric.muleq(diff, 1000);

			chart.options.data.push({
				type: 'line',
				name: dataPoints[i].x + 'Y',
				markerType: 'none',
				showInLegend: true,
				dataPoints: zipXY(plotInstruments.map(maturity), diff)
			});
		}
		//adjustYAxisLimits(chart);
		chart.render();
	}

	function zipXY(xs: number[], ys: number[]): DataPoint[] {
		if (xs.length != ys.length) {
			throw 'xs and ys must have equal length.';
		}
		const n = xs.length;
		let zipped = new Array<DataPoint>(n);
		for (let i = 0; i < n; i++) {
			zipped[i] = { x: xs[i], y: ys[i] };
		}
		return zipped;
	}

	export function adjustYAxisLimits(chart: CanvasJS.Chart, roundTo = 0.5): void {
		let minY = Infinity;
		let maxY = -Infinity;
		const data = chart.options.data;
		for (let i = 0; i < data.length; i++) {
			const dataPoints = data[i].dataPoints;
			for (let j = 0; j < dataPoints.length; j++) {
				const value = dataPoints[j].y;
				if (typeof value === 'number') {
					minY = Math.min(minY, value);
					maxY = Math.max(maxY, value);
				}
			}
		}
		
		// Adjust the Y-axis range to half-percent with 5bp margin.
		const margin = 0.05;
		minY = Math.floor((minY - margin) / roundTo) * roundTo;
		maxY = Math.ceil((maxY + margin) / roundTo) * roundTo;
		chart.options.axisY.minimum = minY;
		chart.options.axisY.maximum = maxY;
		if (chart.options.axisY2) {
			chart.options.axisY2.minimum = minY;
			chart.options.axisY2.maximum = maxY;
		}
		// Note: the caller must call chart.render() to take effect.
		// chart.render();
	}
}