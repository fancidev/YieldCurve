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

	constructor(ts: number[]) {
		const n = ts.length;
		if (n < 1)
			throw 'Must supply at least one maturity.';

		this.n = n;
		this.k = ts.map(t=> Math.log(2) / t); // use maturity as half-life
		this.C = numeric.mul(0.0001, numeric.identity(n));
		this.x = numeric.rep([n], 0);
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
		const w = 0; //.05; // 0;

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
			//gradient[n] = -t * df;
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
		//private C: number[][];
		return s;
	}
}