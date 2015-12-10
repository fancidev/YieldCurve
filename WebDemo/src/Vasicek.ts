'use strict';

/**
 * Represents an n-factor Vasicek model of the yield curve.
 *
 * The model has two types of parameters: structural parameters and
 * state vector. Structural parameters must be specified a-priori;
 * state vector is fitted to observed market rates.
 * 
 * The structural parameters are:
 * 
 *   k[0..n-1] -- mean reversion speed of the factors. By default
 *                they are set to a value such that the half-life
 *                of each factor is equal to the maturity of an
 *                input instrument.
 *   
 *   C[0..n-1][0..n-1] -- instantaneous covariance between factors.
 *                        By default volatility is set to 1% and 
 *                        correlation is set to zero.
 * 
 * The state vector contains:
 *
 *   x[0..n-1] -- initial value of the factors
 *   x[n] -- mean reversion target 
 */
class VasicekModel implements YieldCurveModel {

	private n: number;
	private k: number[];
	private C: number[][];
	private x: number[];
	private wIsState: boolean;

	constructor(ts: number[]) {
		this.wIsState = false;

		const n = this.wIsState ? ts.length - 1 : ts.length;
		if (n < 1)
			throw 'Must supply at least one maturity.';

		this.n = n;
		this.k = ts.slice(0, n).map(t=> Math.log(2) / t); // use maturity as half-life
		this.C = numeric.mul(0.0000, numeric.identity(n));
		this.x = numeric.rep([n + (this.wIsState ? 1 : 0)], 0);
	}

	/**
	 * Returns a reference to the instantaneous covariance matrix of
	 * this model. Changing this matrix will change the model.
	 */
	covariance(): number[][] {
		return this.C;
	}

	/**
	 * Returns a reference to the state vector of this model.
	 */
	state(): number[] {
		return this.x;
	}

	discount(t: number, gradient?: number[]): number {
		const n = this.n;
		const k = this.k;
		const C = this.C;
		const x = this.x;
		const w = this.wIsState ? x[n] : 0.0275;

		// TODO: optimize calculation
		let A = 0;
		for (let i = 0; i < n; i++) {
			for (let j = 0; j < n; j++) {
				A += C[i][j] / (k[i] * k[j]) * (t - B(k[i], t) - B(k[j], t) + B(k[i] + k[j], t));
			}
		}
		let F = w * t - 0.5 * A;
		for (let i = 0; i < n; i++) {
			F += B(k[i], t) * x[i];
		}
		const df = Math.exp(-F);

		if (gradient) {
			gradient.length = 0;
			for (let i = 0; i < n; i++)
				gradient[i] = -B(k[i], t) * df;
			if (this.wIsState)
				gradient[n] = -t * df;
		}
		return df;

		function B(k: number, t: number) {
			if (k == 0)
				return t;
			else
				// return -Math.expm1(-k * t) / k; // requires ES6
				return (1 - Math.exp(-k * t)) / k;
		}
	}

	info(): string {
		let s = '';
		s += '<pre>' + this.n + '-factor Vasicek model</pre>';
		s += '<pre>x = ' + numeric.prettyPrint(numeric.mul(100, this.x)) + '%</pre>';
		s += '<pre>k = ' + numeric.prettyPrint(this.k) + '</pre>';
		s += '<pre>σ = ' + numeric.prettyPrint(getStdev(this.C)) + '</pre>';
		s += '<pre>ρ = ' + "\r\n" + numeric.prettyPrint(getCorrelation(this.C)) + '</pre>';
		return s;
	}
}

class VasicekModelTemplate implements YieldCurveModelTemplate {
	public name: string;
	private ts: number[];
	private covar: number[][];

	constructor(ts: number[]) {
		const n = ts.length;
		this.name = n + '-factor Vasicek';
		this.ts = ts.slice();
		this.covar = numeric.mul(0, numeric.identity(n));
	}

	createModel(instruments: Instrument[]): VasicekModel {
		for (let i = instruments.length - 1; i >= 0; i--) {
			const t = instruments[i].maturity();
			if (this.ts.indexOf(t) < 0)
				instruments.splice(i, 1);
		}
		const model = new VasicekModel(instruments.map(maturity));
		const covar = model.covariance();
		for (let i = 0; i < covar.length; i++) {
			for (let j = 0; j < covar.length; j++) {
				covar[i][j] = this.covar[i][j];
			}
		}
		return model;
	}
	
	/**
	 * Calibrates the structural parameters of Vasicek model to
	 * a panel data of historical rates.
	 */
	calibrate(instruments: Instrument[], marketRates: PanelData) {

		const numDates = numRows(marketRates);
		const numSeries = numCols(marketRates);
		if (numSeries !== instruments.length)
			throw new RangeError('Instruments must match marketRates in size');

		for (let iter = 1; iter < 50; iter++) {
		
			// Fit the model to historical data to get state vector time series.
			const stateHistory: PanelData = new Array<Array<number>>();
			const model = this.createModel(instruments);
			for (let i = 0; i < numDates; i++) {
				fitYieldCurve(model, instruments, marketRates[i]);
				stateHistory[i] = model.state().slice();
			}
		
			// Compute the historical covariance matrix of state vector.
			stateHistory.rownames = marketRates.rownames;
			const stateDiff = diff(stateHistory);
			const covar = covariance(stateDiff);
			numeric.muleq(covar, 250);
		
			// Debug print.
			const volatility = getStdev(covar);
			console.log('Realized factor volatility:');
			console.log(numeric.prettyPrint(volatility));
			const correl = getCorrelation(covar);
			console.log('Realized factor correlation:');
			console.log(numeric.prettyPrint(correl));
		
			// Compare the historical covariance with the model covariance.
			// Because the w parameter in Vasicek model may be treated as
			// either state variable or structural variable, we only compare
			// as many entries as present in the model covar matrix.
			const modelCovar = model.covariance();
			const nf = modelCovar.length;
			let maxDiff = -Infinity;
			for (let i = 0; i < nf; i++) {
				for (let j = 0; j < nf; j++) {
					maxDiff = Math.max(maxDiff, Math.abs(covar[i][j] - modelCovar[i][j]));
				}
			}
			if (maxDiff < 1e-6) { // 0.1% tolerance on volatility
				alert('Calibration finished in ' + iter + ' iterations.');
				return;
			}
	
			// Update model covariance and then continue iteration.
			for (let i = 0; i < nf; i++) {
				for (let j = 0; j < nf; j++) {
					this.covar[i][j] = covar[i][j];
				}
			}
		}
		alert('Calibration failed to converge');
		throw new Error('Calibration failed to converge');
	}
}

const vasicekModelTemplates = [
	new VasicekModelTemplate([10]),
	new VasicekModelTemplate([2, 10]),
	new VasicekModelTemplate([2, 10, 30]),
	new VasicekModelTemplate([0.25, 2, 10, 30]),
	new VasicekModelTemplate([0.25, 2, 5, 10, 30]),
];
