'use strict';

interface DataFrame<R, C> extends Array<Array<number>> {
	rownames?: R[];
	colnames?: C[];
}

type PanelData = DataFrame<Date, string>;

function toPanelData(frame: any[][]): PanelData;
function toPanelData(data: number[][], rownames: Date[], colnames: string[]): PanelData;
function toPanelData(frame?: any[][], rownames?: Date[], colnames?: string[]): PanelData {

	const table: PanelData = new Array<Array<number>>();
	if (rownames && colnames) {
		table.push(...frame);
		table.rownames = rownames;
		table.colnames = colnames;
	}
	else if (rownames) {
		table.push(...frame.slice(1));
		table.rownames = rownames;
		table.colnames = frame[0];
	}
	else if (colnames) {
		table.push(...frame.map(r => r.slice(1)));
		table.rownames = frame.map(r => r[0]);
		table.colnames = colnames;
	}
	else {
		table.push(...frame.slice(1).map(r => r.slice(1)));
		table.rownames = frame.slice(1).map(r => r[0]);
		table.colnames = frame[0].slice(1);
	}

	table.slice = function(start?: number, end?: number): PanelData {
		return toPanelData(Array.prototype.slice.call(this, start, end), this.rownames.slice(start, end), this.colnames);
	};

	return table;
}

function numRows(table: PanelData): int {
	return table.rownames ? table.rownames.length : table.length;
}

function numCols(table: PanelData): int {
	return table.colnames ? table.colnames.length : (table.length > 0) ? table[0].length : 0;
}

//	table.rowIndexOf = function(rowName: Date): int {
//		return this.rownames.indexOf(rowName);
//	};

function getColumnIndex(table: PanelData, columnName: int | string): int {
	if (typeof columnName === 'string') {
		return table.colnames ? table.colnames.indexOf(columnName) : -1;
	} else {
		return columnName;
	}
}

function getColumns(table: PanelData, columns: Array<int | string>): PanelData {
	const columnIndices = columns.map(c => getColumnIndex(table, c));

	const nobs = numRows(table);
	const data = new Array<Array<number>>(nobs);
	for (var i = 0; i < nobs; i++) {
		data[i] = columnIndices.map(j => table[i][j]);
	}
	const colnames = columnIndices.map(j => table.colnames[j]);

	return toPanelData(data, table.rownames.slice(), colnames);
}
		
/**
 * Sorts the observations by date in acsending or descending order.
 */
/*
sortRows(acsending = true): void {
	var nobs = super.length;
	const indices = new Array<int>(nobs);
	for (let i = 0; i < nobs; i++) {
		indices[i] = i;
	}
	
	const self = this;
	indices.sort((i, j) => (self.rowNames[i].getTime() - self.rowNames[j].getTime()) * (acsending ? 1 : -1));
	
	const rowNamesCopy = this.rowNames.slice();
	const dataCopy = super.slice();
	for (let i = 0; i < nobs; i++) {
		this.rowNames[i] = rowNamesCopy[i];
		super[i] = dataCopy[i];
	}
}
*/

/**
 * Scales all elements by a factor and return a new data frame. 
 */
function scale(table: PanelData, factor: number): PanelData {
	const data = numeric.mul(table, factor);
	return toPanelData(data, table.rownames, table.colnames);
}

function covariance(table: PanelData): DataFrame<string, string> {
	const nobs = numRows(table);
	const nvar = numCols(table);

	const C: DataFrame<string, string> = new Array<Array<number>>(nvar);
	for (let i = 0; i < nvar; i++) {
		C[i] = new Array(nvar);
	}
	if (table.colnames) {
		C.rownames = table.colnames.slice();
		C.colnames = table.colnames.slice();
	}

	for (let i = 0; i < nvar; i++) {
		for (let j = i; j < nvar; j++) {
			let sumX = 0, sumY = 0, sumXY = 0, count = 0;
			for (let k = 0; k < nobs; k++) {
				const x = table[i][k];
				const y = table[j][k];
				if (isFinite(x) && isFinite(y)) {
					sumX += x;
					sumY += y;
					sumXY += x * y;
					count += 1;
				}
			}
			const c = (sumXY - sumX * sumY / count) / (count - 1); // unbiased?
			C[i][j] = c;
			C[j][i] = c;
		}
	}
	return C;
}

function getStdev(covar: number[][]): number[] {
	const n = numRows(covar);
	const stdev = new Array<number>(n);
	for (let i = 0; i < n; i++) {
		stdev[i] = Math.sqrt(covar[i][i]);
	}
	return stdev;
}

function getCorrelation(covar: number[][]): number[][] {
	const n = numRows(covar);
	const corr = numeric.clone(covar);
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) {
			if (j !== i) {
				corr[i][j] /= Math.sqrt(corr[i][i] * corr[j][j]);
			}
		}
	}
	for (let i = 0; i < n; i++) {
		corr[i][i] = 1.0;
	}
	return corr;
}

function diff(table: PanelData, d = 1): PanelData {
	const nobs = numRows(table);
	if (d >= nobs) {
		throw new RangeError('d must be less than number of observations');
	}

	const data: PanelData = new Array<Array<number>>(nobs - d);
	for (let i = 0; i < nobs - d; i++) {
		data[i] = numeric.sub(table[i + d], table[i]);
	}

	if (table.rownames) {
		data.rownames = table.rownames.slice(d);
	}
	if (table.colnames) {
		data.colnames = table.colnames.slice();
	}
	return data;
}

/**
 * Returns periodic records from a data table.
 * @param frequency  Can be one of 'd', 'w', 'm', 'q', 's', 'y'.
 */
function periodic(table: PanelData, frequency: string): PanelData {
	const nobs = numRows(table);
	const rownames = new Array<Date>();
	const data = new Array<Array<number>>();
	for (let i = 0; i < nobs; i++) {
		let shouldKeep: boolean;
		if (i == nobs - 1) { // always keep the last observation
			shouldKeep = true;
		} else {
			const thisDate = table.rownames[i];
			const nextDate = table.rownames[i + 1];
			if (frequency === 'w') { // weekly
				shouldKeep = (nextDate.getDay() <= thisDate.getDay() ||
					nextDate.getTime() - thisDate.getTime() >= 7 * 24 * 3600 * 1000);
			} else if (frequency === 'm') { // monthly
				shouldKeep = (thisDate.getFullYear() != nextDate.getFullYear() ||
					thisDate.getMonth() != nextDate.getMonth());
			} else if (frequency === 'q') { // quarterly
				shouldKeep = (thisDate.getFullYear() != nextDate.getFullYear() ||
					Math.floor(thisDate.getMonth() / 3) != Math.floor(nextDate.getMonth() / 3));
			} else if (frequency === 's') { // semi-annually
				shouldKeep = (thisDate.getFullYear() != nextDate.getFullYear() ||
					Math.floor(thisDate.getMonth() / 6) != Math.floor(nextDate.getMonth() / 6));
			} else if (frequency === 'y') { // annually
				shouldKeep = (thisDate.getFullYear() != nextDate.getFullYear());
			} else { // keep by default
				shouldKeep = true;
			}
		}
		if (shouldKeep) {
			rownames.push(table.rownames[i]);
			data.push(table[i]);
		}
	}
	return toPanelData(data, rownames, table.colnames.slice());
}