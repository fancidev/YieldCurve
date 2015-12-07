/// <reference path="canvasjs.d.ts" />

namespace Demo {

	interface DataPoint {
		x: number;
		y: number;
	}

	type CreateInstrument = (maturity: number) => Instrument;

	export function createSwap(t: number): Swap {
		return new Swap(t);
	}
	
	// export createInstrument<T extends Instrument>

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

	export function drawYieldCurve(preset: NamedInterpScheme, createPlotInstrument = createSwap) {

		const dataPoints = defaultDataPoints;
		const n = dataPoints.length;
		const Instrument = Swap; // Fra;
		const instruments: Instrument[] = [];
		const marketRates: number[] = [];
		for (let i = 0; i < n; i++) {
			instruments[i] = new Instrument(dataPoints[i].x);
			marketRates[i] = dataPoints[i].y / 100;
		}

		// Build the yield curve.
		const discount = buildYieldCurve(instruments, marketRates, preset);
		
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
		for (let t = dataPoints[0].x; t <= dataPoints[n - 1].x; t += 1 / 16) {
			const instrument = createPlotInstrument(t);
			const impliedRate = instrument.impliedRate(discount);
			interpolatedPoints.push({ x: t, y: impliedRate * 100 });
		}
		chart.options.data.push({
			type: 'line',
			name: '(' + preset.name + ' Spline)',
			markerType: 'none',
			showInLegend: true,
			dataPoints: interpolatedPoints
		});
		//alert('Plotted');
		
		adjustYAxisLimits(chart);
		chart.render();
	}

	export function drawBumpResponse(preset: NamedInterpScheme) {
		const dataPoints = defaultDataPoints;
		const chart = getBumpResponseChart();
		chart.options.data.length = 0;

		const MarkInstrument = Swap;
		const PlotInstrument = Swap;
		
		// Create instruments.
		const n = dataPoints.length;
		const instruments: Instrument[] = [];
		const marketRates: number[] = [];
		for (let i = 0; i < n; i++) {
			instruments[i] = new MarkInstrument(dataPoints[i].x);
			marketRates[i] = dataPoints[i].y / 100;
		}

		// Build the yield curve.
		const baseCurve = buildYieldCurve(instruments, marketRates, preset);

		let plotInstruments = new Array<Instrument>();
		for (let t = dataPoints[0].x; t <= dataPoints[n - 1].x; t += 1 / 16) {
			plotInstruments.push(new PlotInstrument(t));
		}
		
		// Make base output curve.
		let baseOutput = new Array<number>();
		for (const instrument of plotInstruments) {
			const impliedRate = instrument.impliedRate(baseCurve);
			baseOutput.push(impliedRate);
		}
		
		// Bump each marking input and rebuild the curve.
		for (let i = 0; i < instruments.length; i++) {
			const bumpedMarketRates = marketRates.slice();
			bumpedMarketRates[i] += 0.01;
			const bumpedCurve = buildYieldCurve(instruments, bumpedMarketRates, preset);
			let bumpedOutput = new Array<number>();
			for (const instrument of plotInstruments) {
				const impliedRate = instrument.impliedRate(bumpedCurve);
				bumpedOutput.push(impliedRate);
			}

			const diff = numeric.sub(bumpedOutput, baseOutput);
			numeric.muleq(diff, 100);

			chart.options.data.push({
				type: 'line',
				name: dataPoints[i].x + 'Y',
				markerType: 'none',
				showInLegend: true,
				dataPoints: zipXY(plotInstruments.map(instrument => instrument.maturity()), diff)
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

	function adjustYAxisLimits(chart: CanvasJS.Chart): void {
		let minY = Infinity;
		let maxY = -Infinity;
		const data = chart.options.data;
		for (let i = 0; i < data.length; i++) {
			const dataPoints = data[i].dataPoints;
			for (let j = 0; j < dataPoints.length; j++) {
				const value = dataPoints[j].y;
				minY = Math.min(minY, value);
				maxY = Math.max(maxY, value);
			}
		}
		
		// Adjust the Y-axis range to half-percent with 5bp margin.
		const margin = 0.05;
		const roundTo = 0.50;
		minY = Math.floor((minY - margin) / roundTo) * roundTo;
		maxY = Math.ceil((maxY + margin) / roundTo) * roundTo;
		chart.options.axisY.minimum = minY;
		chart.options.axisY.maximum = maxY;
		
		// Note: the caller must call chart.render() to take effect.
		// chart.render();
	}
}