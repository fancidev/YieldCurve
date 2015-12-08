/// <reference path="BSpline.ts"/>

interface SplineModelConstraint {
	knotIndex: int;
	derivOrder: int;
	derivValue: number;
}

/**
 * Represents a spline model of the yield curve.
 *
 * The model interpolates the log-discount curve using a p-degree
 * spline, where p is specified by the user. The model is fit to n
 * market instruments; the maturities of these instruments are used
 * as knots. In addition, a trivial knot is inserted at t = 0.
 * 
 * Since there are (n + p) spline bases but only n instruments,
 * (p - 1) additional constraints are required to fully specify the
 * model; these constraints are typically imposed on the derivative
 * at boundary points. 
 * 
 * The state vector is an (n + p) vector that contains the weights
 * of each spline basis.
 */
class SplineModel implements YieldCurveModel {

	private spline: BSpline;
	private weights: number[]; // state vector
	private boundaryConditions: [number[][], number[]];

	constructor(ts: number[], degree: int, conditions: SplineModelConstraint[]) {
		const n = ts.length;
		if (n < 2)
			throw new RangeError('Must supply at least 2 maturities');

		const p = degree;
		if (!(p >= 1 && p <= n - 1))
			throw new RangeError('Spline degree out of range.');

		if (conditions.length != p - 1)
			throw new RangeError('Expects ' + (p - 1) + ' boundary conditions.');

		ts = [0, ...ts].sort((a, b) => (a - b));
		this.spline = new BSpline(ts, p, true);
		this.weights = numeric.rep([n + p], 0); // initial weight = 0

		// Build additional constraints.
		const condLHS = new Array<Array<number>>(p);
		const condRHS = new Array<number>(p);

		// Boundary conditions:
		for (let i = 0; i < p - 1; i++) {
			const { knotIndex, derivOrder, derivValue = 0} = conditions[i];
			const x = ts[(knotIndex >= 0) ? knotIndex : ts.length + knotIndex];
			const y = derivValue;
			const order = derivOrder;
			condLHS[i] = this.spline.evaluate(x, order);
			condRHS[i] = y;
		}

		// Trivial constraint: F(0) == 0
		condLHS[p - 1] = this.spline.evaluate(0);
		condRHS[p - 1] = 0;

		this.boundaryConditions = [condLHS, condRHS];
	}

	/**
	 * Returns a reference to the state vector of this model.
	 */
	state(): number[] {
		return this.weights;
	}

	constraints(): [number[][], number[]] {
		return this.boundaryConditions;
	}

	discount(t: number, gradient?: number[]): number {
		const c = this.spline.evaluate(t);
		const F = numeric.dot(c, this.weights);
		const df = Math.exp(-F);
		if (gradient) {
			gradient.length = 0;
			for (let i = 0; i < c.length; i++)
				gradient[i] = -df * c[i];
		}
		return df;
	}
}