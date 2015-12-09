interface YieldCurveModel {
	/**
	 * Gets a reference to the internal state vector of the model.
	 * Changing this vector will change the model.
	 */
	state(): number[];
	
	/**
	 * Returns the discount factor for a given time-to-maturity.
	 * @param t         Time-to-maturity, expressed in years.
	 * @param gradient  If supplied, returns the gradient vector of df with
	 *                  respect to the internal state vector.
	 * @returns Discount factor.  
	 */
	discount(t: number, gradient?: number[]): number;
	
	/**
	 * Gets model-dependent linear constraints imposed on the state vector.
	 * This is used by the Newton solver when fitting the model to market
	 * rates. It avoids the need to invert an internal matrix.
	 * 
	 * If this member is defined, it must return a tuple where the first
	 * element is an m-by-n matrix of linear coefficients and the second
	 * element is an m-by-1 vector of right-hand-side values. (n is the
	 * number of state variables.)
	 * 
	 * If this member is not defined, it is assumed to have no particular
	 * linear constraint. 
	 */
	constraints?(): [number[][], number[]];
	
	/**
	 * Returns an HTML segment that describes the attributes of this model.
	 */
	info?(): string;
}

/**
 * Fits the given yield curve model to observed market rates of a
 * set of instruments. The number of instruments must be equal to
 * the number of internal state variables in the model.
 * 
 * This function uses Newton's method to fit the model. It iterates
 * until the maximum deviation between market and model rates is no
 * more than 0.0001 basis point. If it does not converge within 100
 * iterations, it throw an error.
 * 
 * @param model        The yield curve model to fit
 * @param instruments  Instrument definitions
 * @param marketRates  Observed rates of these instruments
 */
function fitYieldCurve(model: YieldCurveModel, instruments: Instrument[], marketRates: number[]): Discount {

	const n = instruments.length;
	if (n !== marketRates.length) {
		throw new RangeError('instruments and marketRates must have the same length.');
	}

	const m = model.constraints ? model.constraints()[1].length : 0;
	if (n + m !== model.state().length) {
		throw new RangeError("Incorrect number of instruments.");
	}
	
	// Creates a closure of the discount function.
	function discount(t: number, gradient?: number[]): number {
		return model.discount(t, gradient);
	}
	
	// Use Newton's method to fit the model. In each iteration, we
	// solve a linear system C*delta=marketRates-impliedRates, where
	//
	//   C: an (n+m)-by-(n+m) matrix, where the first m rows is the
	//   Jacobian matrix, i.e. J[i][j] is the partial derivative of
	//   the i'th instrument with respect to the j'th state variable;
	//   the rest m rows are model-dependent linear constraints on
	//   the state variables; 
	//
	//   delta: (n+m)-by-1 vector of adjustments to be apply to the
	//   state vector after the iteration.
	//
	for (let iter = 1; iter <= 100; ++iter) {

		// Compute implied rates and Jacobian.
		const C = new Array<Array<number>>(n + m);
		const impliedRates = new Array<number>(n);
		for (let i = 0; i < n; i++) {
			const gradient = new Array<number>(n + m);
			const impliedRate = instruments[i].impliedRate(discount, gradient);
			C[i] = gradient;
			impliedRates[i] = impliedRate;
		}
			
		// Check tolerance.
		const diff = numeric.sub(marketRates, impliedRates);
		const maxDiff = Math.max.apply(null, diff.map(Math.abs));
		const eps = 1.0e-8; // 0.0001 bp
		if (maxDiff < eps) {
			console.log('Newton method found solution in ' + iter + ' iterations.');
			return discount;
		}
		const b = diff;
		
		// Add model-dependent constraints.
		if (m > 0) {
			const [extraConstraints, extraValues] = model.constraints();
			for (let i = 0; i < m; i++) {
				C[n + i] = extraConstraints[i];
				b[n + i] = extraValues[i];
			}
		}
		
		// Solve the equation.
		const delta = numeric.solve(C, b);
		const state = model.state();
		numeric.addeq(state, delta);
	}

	alert('Newton method cannot find solution');
	throw new Error('Newton method cannot find solution');
}

function calibrateVasicek(model: VasicekModel, instruments: Instrument[], marketRates: number[][]) {

	const numDates = marketRates.length - 1;
	const numSeries = instruments.length;

	for (let iter = 1; iter < 50; iter++) {
		
		// Fit the model to historical data to get state vector time series.
		const stateHistory = new Array<Array<number>>();
		for (let i = 0; i < numDates; i++) {
			fitYieldCurve(model, instruments, marketRates[i + 1].slice(1));
			stateHistory[i] = model.state().slice();
		}
	
		// Compute the historical covariance matrix of state vector.
		const stateDiff = PanelData.diff(stateHistory);
		const covar = PanelData.covar(stateDiff);
		numeric.muleq(covar, 250);
		console.log('Realized factor covariance:');
		console.log(numeric.prettyPrint(covar));
		
		// Compare the historical covariance with the model covariance.
		const modelCovar = model.covariance();
		let maxDiff = -Infinity;
		for (let i = 0; i < covar.length; i++) {
			for (let j = 0; j < covar[i].length; j++) {
				maxDiff = Math.max(maxDiff, Math.abs(covar[i][j] - modelCovar[i][j]));
			}
		}
		if (maxDiff < 1e-6) { // 0.1% tolerance on volatility
			return;
		}
	
		// Update model covariance and continue iteration.
		modelCovar.length = 0;
		modelCovar.push(...covar);
	}
	alert('Calibration failed to converge');
	throw new Error('Calibration failed to converge');
}

namespace PanelData {
	
	//private data: any[][]; // [Array<string>, [Date,number ... ]];
	
	//constructor() {
	//	this.data = [];
	//}
	
	type DataTable = any[][];

	/**
	 * Returns periodic records from a data table.
	 * @param frequency  Can be one of 'd', 'w', 'm', 'q', 'y'.
	 */
	export function periodic(table: DataTable, frequency: string): DataTable {
		const numDates = table.length - 1;
		const numSeries = table[0].length - 1;
		const result = [table[0]];
		for (let i = 1; i <= numDates; i++) {
			let shouldKeep: boolean;
			if (i == numDates) { // always keep the last observation
				shouldKeep = true;
			} else {
				const thisDate = table[i][0];
				const nextDate = table[i + 1][0];
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
			if (shouldKeep)
				result.push(table[i]);
		}
		return result;
	}

	export function sort(table: DataTable, acsending = true): DataTable {
		const result = [...table];
		const upperLeft = result[0][0];
		result[0][0] = null;
		result.sort(function(r1, r2) {
			const k1 = r1[0], k2 = r2[0];
			if (k1 instanceof Date && k2 instanceof Date)
				return (k1.getTime() - k2.getTime()) * (acsending ? 1 : -1);
			else if (k1 === null)
				return -1;
			else if (k2 === null)
				return 1;
			else
				return 0;
		});
		result[0][0] = upperLeft;
		return result;
	}

	export function columnIndex(table: DataTable, column: int | string): int {
		if (typeof column === 'string') {
			for (let i = 1; i < table[0].length; i++) {
				if (table[0][i] === column)
					return i;
			}
			return 0;
		}
		else {
			return column;
		}
	}

	export function getColumns(table: DataTable, columns: Array<int | string>): DataTable {
		const columnIndices = [0, ...columns.map(c => columnIndex(table, c))];
		const numDates = table.length - 1;
		const result = new Array(1 + numDates);
		for (var i = 0; i <= numDates; i++) {
			result[i] = columnIndices.map(j => table[i][j]);
		}
		return result;
	}

	export function diff(table: DataTable, d = 1): DataTable {
		const numDates = table.length - 1;
		const numSeries = table[0].length - 1;
		const result = [table[0]];
		for (let i = 1; i <= numDates - d; i++) {
			result[i] = [table[i][0]];
			for (let j = 1; j <= numSeries; j++)
				result[i][j] = table[i][j] - table[i + d][j];
		}
		return result;
	}

	export function scale(table: DataTable, factor = 1): void {
		for (let i = 1; i < table.length; i++) {
			for (let j = 1; j < table[i].length; j++) {
				table[i][j] *= factor;
			}
		}
	}

	export function covar(table: DataTable): number[][] {
		const nobs = table.length - 1;
		const nvars = table[0].length - 1;

		const C = new Array<Array<number>>(nvars);
		for (let i = 0; i < nvars; i++) {
			C[i] = new Array(nvars);
		}

		for (let i = 1; i <= nvars; i++) {
			for (let j = i; j <= nvars; j++) {
				let sumX = 0, sumY = 0, sumXY = 0, count = 0;
				for (let k = 1; k <= nobs; k++) {
					const x = table[i][k];
					const y = table[j][k];
					if (typeof x === 'number' && isFinite(x) &&
						typeof y === 'number' && isFinite(y)) {
						sumX += x;
						sumY += y;
						sumXY += x * y;
						count += 1;
					}
				}
				const c = (sumXY - sumX * sumY / count) / (count - 1); // unbiased?
				C[i - 1][j - 1] = c;
				C[j - 1][i - 1] = c;
			}
		}
		return C;
	}
}