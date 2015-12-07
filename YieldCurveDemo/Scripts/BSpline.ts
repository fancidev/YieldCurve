'use strict';

interface InterpDerivCondition {
	knotIndex: number;
	derivOrder: number;
}

interface InterpSettings {
	degree: number;
	conditions?: InterpDerivCondition[];
}

type int = number;

class BSpline {

	/** 
	 * Number of knots, not counting the multiplicity knots automatically
	 * added at the beginning and at the end.
	 */
	private n: int;
	
	/** Spline degree: 1=linear, 2=quadratic, 3=cubic, etc */
	private p: int;
	
	/** Knot vector, including automatically-added multiplicity knots */
	private xs: number[];
	
	private C: number[][];
	
	
	/**
	 * Creates a family of B-splines with the given knot locations
	 * and constraint structures. Each constraint is imposed either
	 * on the spline's value or on its derivative at given locations.
	 * The family contains all splines by varying the constraint
	 * values.
	 * 
	 * @param x           X-coordinates of the knot points. Must have at
	 *                    least two elements.
	 * @param degree      Degree of the spline; must be a positive integer.
	 *                    For example, 1=linear, 2=quadratic, 3=cubic, etc.
	 * @param conditions  Extra conditions to impose on the derivative of
	 *                    selected knot points. The number of conditions
	 *                    must be equal to (degree - 1). Each condition is
	 *                    a named tuple:
	 *                    knotIndex:  zero-based knot index; if negative,
	 *                                the index is counted backward
	 *                    derivOrder: order of derivative (1, 2, ...)
	 *
	 * @return A BSpline object that represents a family of b-splines.
	 */
	constructor(x: number[], degree: int, conditions: InterpDerivCondition[]) {

		const n = x.length;
		const p = degree;
		if (n < 2)
			throw 'Must have at least 2 points.';
		if (p < 1)
			throw 'Degree must be at least 1.';
		
		// add multiplicity knots to begin and end
		const xMin = x[0];
		const xMax = x[x.length - 1];
		let xs = x.slice();
		for (let i = 0; i < p; i++) {
			xs.splice(0, 0, xMin);
			xs.push(xMax);
		}
		// Now:
		// xx[0..p-1]   = multiplicity knots
		// xx[p..p+n-1] = user-supplied real knots
		// xx[p+n..p+n+p-1] = multiplicity knots
		
		// Compute the values of b-spline bases at user-supplied
		// knot points. There are (n+p-1) bases. The first basis
		// is always = 1 at the first point. The last basis is
		// always = 1 at the last point.
		
		// A vector of (n+p-1) `weights', w[0..(n-1)+(p-1)],
		// are multiplied to the bspline bases. We need (n+p-1)
		// equations to solve these weights. The first n
		// equations correspond to the user supplied knot
		// values. The rest (p-1) equations correspond to the
		// derivative conditions at selected knot points.
		
		let C: number[][] = []; // (n+p-1)-by-(n+p-1) square matrix
		
		// First knot:
		C[0] = numeric.rep([n + p - 1], 0);
		C[0][0] = 1.0;
		
		// Last knot:
		C[n - 1] = numeric.rep([n + p - 1], 0);
		C[n - 1][n + p - 2] = 1.0;
		
		// Interior knots: 
		for (let i = 1; i < n - 1; i++) {
			// Each has exactly p non-zero bases.
			C[i] = numeric.rep([n + p - 1], 0);
			for (let j = 0; j < p; j++) {
				C[i][i + j] = BSpline.N(i + j, p, xs, x[i]);
			}
		}
		
		// Additional conditions:
		if (conditions.length !== p - 1) {
			throw 'Wrong number of conditions.';
		}
		for (let k = 0; k < p - 1; k++) {
			const cond = conditions[k];
			let knotIndex = cond['knotIndex'];
			const derivOrder = cond['derivOrder'];
			if (knotIndex < 0) {
				knotIndex += n;
			}
			if (!(knotIndex >= 0 && knotIndex < n)) {
				throw 'Invalid knot index: ' + knotIndex;
			}
			if (!(derivOrder >= 1 && derivOrder < p)) {
				throw 'Invalid order of derivative: ' + derivOrder;
			}
			
			// The first knot and last knot has 2 non-zero
			// derivatives; the interior knots each has 3
			// non-zero derivatives. <- TBC
			C[n + k] = numeric.rep([n + p - 1], 0);
			const i = knotIndex;
			for (let j = 0; j < p; j++) {
				C[n + k][i + j] = BSpline.dN(i + j, p, xs, x[i], derivOrder);
			}
		}

		// Debug output.
		//if (false) {
		//	var invC = numeric.inv(C);
		//	$('#debugOutput').html(
		//		'<pre>' + numeric.prettyPrint(C) + '</pre>' +
		//		'<pre>Inverse</pre>' +
		//		'<pre>' + numeric.prettyPrint(invC) + '</pre>');
		//}
		
		// The matrix C is what we store internally. Each
		// `specialization' of the spline is found by solving
		// the weights w such that C*w = b where b is a vector
		// of user-supplied knot values and boundary conditions.
		this.C = C;
		this.p = p;
		this.n = n;
		this.xs = xs;
	}
	
	/**
	 * Gets the coefficient matrix, C, of the b-spline family.
	 * 
	 * @return A (n+p-1)-by-(n+p-1) square matrix C such that C*w = b
	 *         uniquely determines a spline of this family, where
	 *           w = weights of the b-spline bases
	 *           n = number of interpolated points
	 *           p = degree of the spline
	 *           b = (n+p-1)-by-1 vector of constraint values
	 */
	coefficients(): number[][] {
		return this.C;
	}
	
	/**
	 * Gets the constraint-dependent value of the spline family at a
	 * given X-coordinate.
	 *
	 * @return A (n+p-1)-element vector, c, whose inner product with
	 *        a spline's weight vector gives the spline's value at x.
	 */
	evaluate(x: number): number[] {
		const n = this.n;
		const p = this.p;
		let c = [];
		for (var i = 0; i < n + p - 1; i++) {
			c[i] = BSpline.N(i, p, this.xs, x);
		}
		return c;
	}
	
	/**
	 * Creates an instance of the b-spline family by fitting to a
	 * particular set of constraint values.
	 * 
	 * @param y  The first n constraints are interpreted as values at
	 *           knot points; the rest (p-1) constraints are interpreted
	 *           as the derivative values at supplied knots. Any
	 *           unspecified derivative constraint is supposed to be 0.
	 *
	 * @return   A univariate function, f, such that y=f(x) evaluates to 
	 *           the spline's value at x.
	 */
	fit(y: number[]): (number) => number {

		const n = this.n;
		const p = this.p;

		y = y.slice();
		if (y.length < n)
			throw 'y must have at least ' + n + ' elements.';
		if (y.length > n + p - 1)
			throw 'y must have at most ' + (n + p - 1) + ' elements.';
		if (y.length < n + p - 1) {
			for (let i = y.length; i < n + p - 1; i++)
				y.push(0);
		}

		const C = this.C;
		const w = numeric.solve(C, y);
		const obj = this;

		const f = function(x) {
			let c = obj.evaluate(x);
			return numeric.dot(c, w);
		};
		//f.weights = w;
		return f;
	}
	
	// Returns the i'th b-spline basis of this family.
	basis(i: int, derivOrder: int = 0): (number) => number {

		const n = this.n;
		const p = this.p;
		const xs = this.xs;

		if (!(i >= 0 && i < n + p - 1))
			throw 'Invalid basis number: ' + i;

		return function(x) {
			return BSpline.dN(i, p, xs, x, derivOrder);
		}
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