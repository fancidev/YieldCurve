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

	private C: number[][];
	private p: int; // degree: 1=linear, 2=quadratic, 3=cubic, etc
	private n: int; // number of points to interpolate
	private x: number[];
	private xx: number[];
	
	// Creates a family of B-splines that interpolate the given
	// points and satisfy the given derivative conditions.
	//
	// PARAMETERS
	// 
	//   x         X-coordinates of the points being interpolated.
	//
	//   degree    Degree of the spline, must be a positive integer.
	//             1 - linear
	//             2 - quadratic spline
	//             3 - cubic spline
	//             etc.
	// 
	//   cond      Extra conditions to impose on the derivative of
	//             selected knot points. The number of conditions
	//             must be equal to (degree - 1). Each condition is
	//             a named tuple:
	//             {
	//               knotIndex:  zero-based knot index; if negative,
	//                           the index is counted backward
	//               derivOrder: order of derivative (1, 2, ...)
	//             }
	//
	// RETURN VALUE
	//
	//   A BSpline object that represents a family of b-splines.
	//

	constructor(x: number[], degree: int, conditions: InterpDerivCondition[]) {

		var N = BSpline.N;
		var dN = BSpline.dN;

		var n = x.length;
		var p = degree;
		if (n < 2)
			throw 'Must have at least 2 points.';
		if (p < 1)
			throw 'Degree must be at least 1.';
		
		// add multiplicity knots to begin and end
		var xMin = x[0];
		var xMax = x[x.length - 1];
		var xx = x.slice();
		for (var i = 0; i < p; i++) {
			xx.splice(0, 0, xMin);
			xx.push(xMax);
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
		
		var C: number[][] = []; // (n+p-1)-by-(n+p-1) square matrix
		
		// First knot:
		C[0] = numeric.rep([n + p - 1], 0);
		C[0][0] = 1.0;
		
		// Last knot:
		C[n - 1] = numeric.rep([n + p - 1], 0);
		C[n - 1][n + p - 2] = 1.0;
		
		// Interior knots: 
		for (var i = 1; i < n - 1; i++) {
			// Each has exactly p non-zero bases.
			C[i] = numeric.rep([n + p - 1], 0);
			for (var j = 0; j < p; j++) {
				C[i][i + j] = N(i + j, p, xx, x[i]);
			}
		}
		
		// Additional conditions:
		if (conditions.length != p - 1) {
			throw 'Wrong number of conditions.';
		}
		for (var k = 0; k < p - 1; k++) {
			var cond = conditions[k];
			var knotIndex = cond['knotIndex'];
			var derivOrder = cond['derivOrder'];
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
			var i = knotIndex;
			for (var j = 0; j < p; j++) {
				C[n + k][i + j] = dN(i + j, p, xx, x[i], derivOrder);
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
		this.x = x;
		this.xx = xx;
	}
	
	// Gets the coefficient matrix, C, of the b-spline family.
	// 
	// RETURN VALUE
	// 
	//   A (n+p-1)-by-(n+p-1) square matrix C such that C*w = b
	//   uniquely determines a spline of this family, where
	//     w = weights of the bspline bases
	//     n = number of interpolated points
	//     p = degree of the spline
	//     b = (n+p-1)-by-1 vector of `realization' constraints
	//
	coefficients(): number[][] {
		return this.C;
	}
	
	// Gets the value of the spline family at a given X-coordinate.
	//
	// RETURN VALUE
	//
	//   A (n+p-1)-element vector, c, whose inner product with
	//   a spline's weight vector gives the spline's value at x.
	evaluate(x: number): number[] {
		var n = this.n;
		var p = this.p;
		var c = []; // zeroVector(n + p - 1);
		for (var i = 0; i < n + p - 1; i++) {
			c[i] = BSpline.N(i, p, this.xx, x);
		}
		return c;
	}
	
	// Creates an instance of the b-spline family by fitting to the
	// given y values and derivative values.
	//
	// PARAMETERS
	//
	//   y    The first n constraints are interpreted as values at
	//        knot points; the rest (p-1) constraints are interpreted
	//        as the derivative values at supplied knots. Any
	//        unspecified derivative constraint is supposed to be 0.
	//
	// RETURN VALUE
	//
	//   A univariate function, f, such that y=f(x) evaluates to 
	//   the spline value at x.
	//
	fit(y: number[]): (number) => number {

		var n = this.n;
		var p = this.p;

		y = y.slice();
		if (y.length < n)
			throw 'y must have at least ' + n + ' elements.';
		if (y.length > n + p - 1)
			throw 'y must have at most ' + (n + p - 1) + ' elements.';
		if (y.length < n + p - 1) {
			for (var i = y.length; i < n + p - 1; i++)
				y.push(0);
		}

		var C = this.C;
		var w = numeric.solve(C, y);
		var obj = this;

		var f = function(x) {
			var c = obj.evaluate(x);
			return numeric.dot(c, w);
		};
		//f.weights = w;
		return f;
	}
	
	// Returns the i'th b-spline basis of this family.
	basis(i: int, derivOrder: int) {

		var n = this.n;
		var p = this.p;
		var xx = this.xx;

		if (!(i >= 0 && i < n + p - 1))
			throw 'Invalid basis number: ' + i;
		if (typeof (derivOrder) === 'undefined')
			derivOrder = 0;

		return function(x) {
			return BSpline.dN(i, p, xx, x, derivOrder);
		}
	}

	// Bezier basis function: N[i,n,a](u)
	// See the book
	private static N(i: int, n: int, a: number[], u: number): number {
		if (n == 0) {
			//var leftContinuous = false;
			//if (leftContinuous)
			//	return (u > a[i] && u <= a[i+1])? 1 : 0;
			//else
			//	return (u >= a[i] && u < a[i+1])? 1 : 0;
			if (u >= a[i] && u < a[i + 1])
				return 1;
			if (u == a[i + 1] && a[i] < a[i + 1] && a[i + 1] == a[a.length - 1])
				return 1;
			return 0;
		}
		var alpha1 = (a[i + n] - a[i] == 0) ? 0 : (u - a[i]) / (a[i + n] - a[i]);
		var alpha2 = (a[i + 1 + n] - a[i + 1] == 0) ? 0 : (u - a[i + 1]) / (a[i + 1 + n] - a[i + 1]);
		return alpha1 * BSpline.N(i, n - 1, a, u) + (1 - alpha2) * BSpline.N(i + 1, n - 1, a, u);
	}
	
	// Derivative of B-spline basis Bezier basis function: N[i,n,a](u)
	// See the book
	private static dN(i: int, n: int, a: number[], u: number, d: number): number {
		if (d == 0) {
			return BSpline.N(i, n, a, u);
		}
		if (n == 0) {
			return NaN;
		}
		var v1 = (a[i + n] - a[i] == 0) ? 1 : (a[i + n] - a[i]);
		var v2 = (a[i + n + 1] - a[i + 1] == 0) ? 1 : (a[i + n + 1] - a[i + 1]);
		return n / v1 * BSpline.dN(i, n - 1, a, u, d - 1) - n / v2 * BSpline.dN(i + 1, n - 1, a, u, d - 1);
	}
}