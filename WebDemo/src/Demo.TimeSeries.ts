'use strict';

class TimeSeriesChart {

	/**
	 * Id of the DIV that contains the CanvasJS chart.
	 */
	private _chartId: string;
	
	/**
	 * The CanvasJS.Chart object.
	 */
	private _chart: CanvasJS.Chart;
	
	/**
	 * The current data being plotted.
	 */
	private _data: PanelData;
	
	/**
	 * Currently selected indices (into data).
	 */
	private _selectedIndices: number[];

	/**
 	 * Creates a time series chart in the given DIV.
	 * @param chartId Id of the DIV to place the chart in.  
 	 */
	constructor(chartId: string) {

		const self = this;

		CanvasJS.addColorSet("office", [
			'#29A2CC',
			'#D31E1E',
			'#7CA82B',
			'#EF8535',
			'#A14BC9',
			'#A05F18',
			'#265E96',
			'#6B7075',
			'#96C245'
		]);

		// Create time series chart.
		$('#' + chartId).CanvasJSChart({
			colorSet: 'office',
			toolTip: {
				shared: true,
				animationEnabled: false,
				enabled: true,
				fontStyle: 'normal',
				fontSize: 12,
				fontFamily: 'Arial',
				backgroundColor: 'rgba(255,255,255,1.0)',
				borderThickness: 1,
				cornerRadius: 0,
				borderColor: 'gray',
				contentFormatter: function(e) {
					var content = '<strong>' + CanvasJS.formatDate(e.entries[0].dataPoint.x, 'YYYY-MM-DD') + '</strong><hr/>';
					content += '<table cellspacing="0" cellpadding="0">';
					// Last series is background series; skip it.
					for (var i = e.entries.length - 2; i >= 0; i--) {
						content += '<tr><td style="text-align: right; color: ';
						content += e.entries[i].dataSeries.color;
						content += '">';
						content += e.entries[i].dataSeries.name;
						content += '</td><td>&nbsp;&nbsp;';
						content += e.entries[i].dataPoint.y;
						content += '</td></tr>';
					}
					content += '</table>';
					return content;
				}
			},
			dataPointMinWidth: 3,
			legend: {
				horizontalAlign: 'center',
				verticalAlign: 'top',
				fontSize: 11,
				fontFamily: 'Arial',
				fontWeight: 'normal',
				cursor: 'pointer',
				itemclick: e => self.onClickLegend(e)
			},
			axisX: {
				gridColor: 'lightgray',
				gridDashType: 'dash',
				gridThickness: 1,
				labelFontColor: 'black',
				labelFontFamily: 'Arial',
				labelFontSize: 12,
				lineColor: 'gray',
				lineThickness: 1,
				stripLines: [],
				tickColor: 'gray',
				tickLength: 5,
				tickThickness: 1,
				valueFormatString: 'YYYY-MM-DD',
			},
			axisY: {
				interval: 2,
				lineColor: 'gray',
				lineThickness: 1,
				labelFontColor: 'black',
				labelFontFamily: 'Arial',
				labelFontSize: 12,
				//labelFormatter: function (e) { return CanvasJS.formatNumber(e.value, '0.00'); }
				gridColor: 'lightgray',
				gridDashType: 'dash',
				gridThickness: 1,
				tickColor: 'gray',
				tickThickness: 1,
			},
			axisY2: {
				interval: 2,
				lineColor: 'gray',
				lineThickness: 1,
				labelFontColor: 'black',
				labelFontFamily: 'Arial',
				labelFontSize: 12,
				//labelFormatter: function (e) { return CanvasJS.formatNumber(e.value, '0.00'); }
				gridColor: 'lightgray',
				gridDashType: 'dash',
				gridThickness: 1,
				tickColor: 'gray',
				tickThickness: 1,
			},
			zoomEnabled: false,
			data: []
		});
	
		// Hook keyboard events.
		$("#" + chartId)
			.attr('tabindex', '0')
			.keydown(e => self.onKeyDown(e))
			.mousedown(e => self.onMouseDown(e));

		this._chartId = chartId;
		this._chart = $('#' + chartId).CanvasJSChart(); // chart;
		this._selectedIndices = [];
		this._data = [];
		this._data.rownames = [];
		this._data.colnames = [];
	}

	private onClickLegend(e: CanvasJS.ChartEvent) {
		const dataSeriesIndex = e.dataSeriesIndex;
		// Because a dummy series is created for each real series,
		// we need to hide both series (one for the lines and one
		// for the legend).
		const allSeries = e.chart.options.data;
		const visible = (e.dataSeries.visible === false);
		e.dataSeries.visible = visible;
		allSeries[dataSeriesIndex - (allSeries.length - 1) / 2].visible = visible;
		e.chart.render();
	}

	private onMouseDown(e: JQueryMouseEventObject) {
		$('#' + this._chartId).focus();
	}

	private onKeyDown(e: JQueryKeyEventObject) {

		let table = this._data;
		if (table.length === 0) // no observations
			return;
		
		// Left, Right, Home, End: select a single item 
		/// Ctrl+L/R/H/E: moves selection in parallel
		/// Shift+L/R/H/E: select a range of items
		/// For a list of keycodes, see https://api.jquery.com/keydown/
		let selection = this._selectedIndices.slice();
		switch (e.keyCode) {
			case 37: // left arrow
				if (selection.length === 0) {
					selection = [table.length - 1];
				} else if (selection[0] > 0) {
					//if (e.shiftKey) { // TBD: doesn't work well
					//	selection.push(selection[0]-1);
					//} else if (e.ctrlKey) {
					//	for (var i = 0; i < selection.length; i++)
					//		--selection[i];
					//} else {
					selection = [selection[0] - 1];
					//}
				}
				this.setSelectedIndices(selection);
				break;
			case 39: // right arrow
				if (selection.length == 0) {
					selection = [0];
				} else if (Math.max(...selection) < table.length - 1) {
					//if (e.shiftKey) { // TBD: doesn't work well
					//	selection.push(selection[selection.length-1]+1);
					//} else if (e.ctrlKey) {
					//	for (var i = 0; i < selection.length; i++)
					//		++selection[i];
					//} else {
					selection = [selection[selection.length - 1] + 1];
					//}
				}
				this.setSelectedIndices(selection);
				break;
			case 36: // home
				if (table.length > 0) {
					this.setSelectedIndices([0]);
				}
				break;
			case 35: // end
				if (table.length > 0) {
					this.setSelectedIndices([table.length - 1]);
				}
				break;
			case 27: // ESC
				this.setSelectedIndices([]);
				break;
			default:
				return;
		}
		e.stopPropagation();
		e.preventDefault();
	}
	
	// Returns an array of (zero-based) indices of selected dates
	// in the time series chart.
	//	private getSelection() {
	//		var stripLines = this.chart.options.axisX.stripLines;
	//		var indices = stripLines.map(stripLine=> stripLine.index);
	//		return indices;
	//	}

	private setSelectedIndices(indices: number[]) {

		if (indices.length === 1 && this._selectedIndices.length === 1 &&
			indices[0] === this._selectedIndices[0])
			return;
		
		// Draw a vertical line across the chart to highlight the selected dates.
		const table = this._data;
		const dates = table.rownames;
		const stripLines = this._chart.options.axisX.stripLines;
		stripLines.length = 0;
		for (let i = 0; i < indices.length; i++) {
			var dt = dates[indices[i]];
			stripLines.push({
				color: 'red',
				label: ' ' + CanvasJS.formatDate(dt, 'YYYY-MM-DD') + ' ', // '▲'
				labelBackgroundColor: '#666666',
				labelFontColor: 'white',
				thickness: 1,
				value: dt,
			});
		}
		this._chart.render();
		this._selectedIndices = indices.slice();

		if (this._selectionChangedHandler) {
			var self = this;
			this._selectionChangedHandler(indices.map(index => dates[index]));
		}
		
		// Trigger selectionChanged event
				
		// Plot the term structure of the selected dates on a separate chart.
		//var filtered = [table[0]];
		//indices.sort();
		//for (var i = 0; i < indices.length; i++) {
		//	filtered.push(table[indices[i]]);
		//}
		//drawTermStructure(filtered);
	}

	setData(data: PanelData) {
		const self = this;
		const chart = this._chart;
		chart.options.data.length = 0;
		for (let j = 0; j < numCols(data); j++) {
			const series: CanvasJS.ChartDataOptions = {
				type: 'line',
				name: data.colnames[j],
				markerType: 'circle',
				//legendMarkerType: 'square',
				highlightEnabled: true,
				showInLegend: false,
				dataPoints: new Array<CanvasJS.ChartDataPoint>(),
				axisYType: "primary",
				click: e => self.onClickTimeSeries(e),
				//focusable: true // ???
			};
			for (let i = 0; i < numRows(data); i++) {
				series.dataPoints[i] = {
					x: data.rownames[i],
					y: data[i][j]
				};
			}
			chart.options.data.push(series);
		}
		
		// Add dummy series for the pretty legends
		for (let j = 0; j < numCols(data); j++) {
			const series = {
				type: 'scatter',
				name: ' ' + data.colnames[j],
				markerType: 'square',
				//markerSize: 10,
				highlightEnabled: true,
				showInLegend: true,
				axisYType: "secondary",
				dataPoints: new Array<CanvasJS.ChartDataPoint>(),
			};
			chart.options.data.push(series);
		}

		Demo.adjustYAxisLimits(chart, 1.0);

		// Add a background column chart to use as indicator and
		// catch click events.
		var backgroundSeries: CanvasJS.ChartDataOptions = {
			type: "rangeColumn",
			//color: "#B0D0B0",
			color: 'transparent',
			highlightColor: 'gray',
			//highlightColor: 'orange',
			highlightOpacity: 0.5,
			showInLegend: false,
			//toolTipContent: null,
			click: e => self.onClickTimeSeries(e),
			dataPoints: new Array<CanvasJS.ChartDataPoint>(),
		};
		const yMin = chart.options.axisY.minimum;
		const yMax = chart.options.axisY.maximum;
		for (let i = 0; i < numRows(data); i++) {
			backgroundSeries.dataPoints.push({
				x: data.rownames[i], y: [yMin, yMax]
			});
		}
		chart.options.data.push(backgroundSeries);

		// Update members.
		this._data = data;
		this.setSelectedIndices([]);
	}

	private onClickTimeSeries(e: CanvasJS.ChartEvent) {
		const dt: Date = e.dataPoint.x;
		//currentDateIndex = getRowIndex(demoData, dt);
		//refreshTermStructure();
		const data = this._data;
		const index = getRowIndex(data, dt);
		this.setSelectedIndices([index]);
	}

	private _selectionChangedHandler: (selectedDates: Date[]) => void;

	onSelectionChanged(handler: (selectedDates: Date[]) => void) {
		this._selectionChangedHandler = handler;
	}
}