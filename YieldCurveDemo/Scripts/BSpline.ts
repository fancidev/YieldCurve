'use strict';

type int = number;

interface BSplineConstraint {
	x: number;
	y: number;
	order?: int;
}

/**
 * Represents a family of B-splines of given knot vector and degree.
 * Each spline in this family is a linear combinations of (the same
 * set of) basis functions, and is therefore uniquely determined by
 * the weights of the linear combination.
 * 
 * Such a family of B-splines also has the property that the value
 * or derivative at any given X-coordinate is a linear combination
 * of the weight vector. 
 */
class BSpline {

	/** Knot vector; nondecreasing and contains at least two elements */
	private xs: number[];
		
	/** Spline degree: 1=linear, 2=quadratic, 3=cubic, etc */
	private p: int;
	
	/**
	 * Creates a family of B-splines of the given knot vector and degree.
	 * 
	 * @param xs      Knot vector; must contain at least two elements.
	 *                A copy of this vector is made and stored in the
	 *                object.
	 * @param degree  Degree of the spline; must be a positive integer.
	 *                For example, 1=linear, 2=quadratic, 3=cubic, etc.
	 * @param addMultiKnots  If true, automatically add 'degree' number
	 *                       of multiplicity knots to the beginning and
	 *                       end of the given knots.
	 * 
	 * @return A BSpline object that represents a family of B-splines.
	 */
	constructor(xs: number[], degree: int, addMultiKnots = false) {

		if (xs.length < 2) {
			throw 'Knot vector must contain at least 2 elements.';
		}
		xs = xs.slice().sort((a, b) => (a - b));

		const p = degree;
		if (p < 1) {
			throw 'Spline degree must be at least 1.';
		}

		if (addMultiKnots) {
			for (let i = 0; i < p; i++) {
				xs.splice(0, 0, xs[0]);
				xs.push(xs[xs.length - 1]);
			}
		}
		if (p > xs.length - 1) {
			throw 'Spline degree must be no greater than number of points - 1';
		}

		this.xs = xs;
		this.p = p;
	}
	
	/**
	 * Returns the knot vector of the B-spline family.
	 */
	knots(): number[] {
		return this.xs;
	}
	
	/**
	 * Returns the degree of the B-spline family.
	 */
	degree(): int {
		return this.p;
	}
	
	/**
	 * Returns the number of spline basis functions. This is equal
	 * to the number of knots minus 1 minus the degree of the spline.
	 */
	basisCount(): int {
		return this.xs.length - 1 - this.degree();
	}
	
	/**
	 * Gets the i'th spline basis function or its derivative.
	 * 
	 * @param i      Zero-based index of the spline basis.
	 * @param order  Order of derivative; default is 0 for value.
	 * 
	 * @returns  A univariate function.
	 */
	basis(i: int, order: int = 0): (x: number) => number {
		const xs = this.knots();
		const p = this.degree();
		const m = this.basisCount();

		if (!(i >= 0 && i < m))
			throw `Invalid basis index: ${i}`;
		if (!(order >= 0 && order <= p))
			throw 'Invalid derivative order';

		return function(x: number) {
			return BSpline.dN(i, p, xs, x, order);
		}
	}
	
	/**
	 * Gets the constraint-dependent value or derivative of the spline
	 * at a given X-coordinate.
	 *
	 * @param x      X-coordinate at which to evaluate the spline function
	 *               or its derivative.
	 * @param order  Order of the derivative; default is 0 for value.
	 * 
	 * @returns  A (n-p-1)-element vector, c, whose inner product with
	 *           a spline's weight vector gives the spline's value or
	 *           derivative at x.
	 */
	evaluate(x: number, order: int = 0): number[] {
		const xs = this.xs;
		const n = this.xs.length;
		const p = this.p;
		const m = n - 1 - p;

		if (!(x >= xs[0] && x <= xs[m])) {
			throw 'x is outside the range covered by this spline.';
		}
		if (!(order >= 0 && order <= p)) {
			throw 'order must be between 0 and ' + p;
		}

		// TODO: Optimize this loop by not computing elements that
		// are definitely zero.
		let c = numeric.rep([m], 0);
		for (let i = 0; i < m; i++) {
			c[i] = BSpline.dN(i, p, this.xs, x, order);
		}
		return c;
	}
	
	/**
	 * Creates a specific instance of the b-spline family by applying
	 * the given weights to its spline bases.
	 * 
	 * @param weights  A vector of weights to apply to the spline bases.
	 *                 The vector must contain exactly (n - 1 - p)
	 *                 elements, where n is the number of knots and 
	 *                 p is the spline's degree. The weights are copied
	 *                 by value.
	 * @param order    If ommitted or zero, returns the spline function;
	 *                 otherwise, returns the order'th derivative of
	 *                 the spline function.
	 * 
	 * @return   A univariate function, f, such that y=f(x) evaluates to 
	 *           the spline's value at x.
	 */
	apply(weights: number[], order = 0): (x: number) => number {
		const m = this.basisCount();
		if (weights.length != m) {
			throw 'Weights must contain exactly ' + m + ' elements';
		}
		const w = weights.slice();
		const self = this;
		const f = function(x: number) {
			let c = self.evaluate(x, order);
			return numeric.dot(c, w);
		};
		return f;
	}
	
	/**
	 * Creates a specific instance of the b-spline family by fitting
	 * to a set of constraints. This is an example that shows how to
	 * use the BSpline class. 
	 * 
	 * @param constraints  A set of constraints on the spline's value
	 *                     or derivative at given X-coordinates. The
	 *                     number of constraints must be equal to the
	 *                     number of basis functions.
	 *
	 * @return   A univariate function, f, such that f(x) gives the 
	 *           spline's value at x.
	 */
	fit(constraints: BSplineConstraint[]): (x: number) => number {

		const m = this.basisCount();
		if (constraints.length !== m) {
			throw 'The number of constraints must be equal to ' + m;
		}

		let C: number[][] = []; // m-by-m square matrix
		let b: number[] = [];
		for (let k = 0; k < m; k++) {
			const {x, y, order = 0} = constraints[k];
			C[k] = this.evaluate(x, order);
			b[k] = y;
		}

		const w = numeric.solve(C, b);
		return this.apply(w);
	}
	
	/**
	 * Returns the d'th derivative of the i'th basis function of
	 * a b-spline with given knots.
	 * 
	 * @param i  Zero-based index of the basis function to compute.
	 * @param p  Degree of the spline.
	 * @param xs Knot vector; must be non-decreasing.
	 * @param x  The point to compute the value.
	 * @param d  The order of derivative to return; default is 0, 
	 *           which returns the value of the basis function.
	 * 
	 * @description 
	 * For any p > 0, each basis function is continuous everywhere.
	 * When p = 0, the basis function is assumed to be right-continuous
	 * at knot points, except for the last non-empty interval, for
	 * which the basis function is assumed to be left-continuous.
	 */
	private static N(i: int, p: int, xs: number[], x: number): number {
		if (p == 0) {
			if (xs[i] == xs[i + 1]) // multiplicity knot
				return 0;
			if (x >= xs[i] && x < xs[i + 1]) // left-continuous at knots
				return 1;
			if (x == xs[i + 1] && x == xs[xs.length - 1]) // right-continuous at last knot
				return 1;
			return 0;
		}
		var w1 = (xs[i + p] == xs[i]) ? 0 : (x - xs[i]) / (xs[i + p] - xs[i]);
		var w2 = (xs[i + 1 + p] == xs[i + 1]) ? 0 : (x - xs[i + 1]) / (xs[i + 1 + p] - xs[i + 1]);
		return w1 * BSpline.N(i, p - 1, xs, x) + (1 - w2) * BSpline.N(i + 1, p - 1, xs, x);
	}
	
	// Derivative of B-spline basis Bezier basis function: N[i,n,a](u)
	// See the book
	private static dN(i: int, p: int, xs: number[], x: number, d: int = 0): number {
		if (d == 0) {
			return BSpline.N(i, p, xs, x);
		}
		if (p == 0) {
			return NaN;
		}
		var v1 = (xs[i + p] - xs[i] == 0) ? 1 : (xs[i + p] - xs[i]);
		var v2 = (xs[i + p + 1] - xs[i + 1] == 0) ? 1 : (xs[i + p + 1] - xs[i + 1]);
		return p / v1 * BSpline.dN(i, p - 1, xs, x, d - 1) - p / v2 * BSpline.dN(i + 1, p - 1, xs, x, d - 1);
	}
}