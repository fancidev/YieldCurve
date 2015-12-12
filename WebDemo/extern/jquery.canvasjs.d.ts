interface JQuery {
	CanvasJSChart(): CanvasJS.Chart;
	CanvasJSChart(options: CanvasJS.ChartOptions): void; // CanvasJS.Chart;
}

declare module CanvasJS {
	function formatDate(date: Date, format?: string, culture?: string): string;
}
