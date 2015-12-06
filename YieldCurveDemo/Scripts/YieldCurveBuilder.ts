/**
 * Builds a yield curve by interpolating the log discount factor curve using
 * a b-spline. 
 * 
 * @param instruments  Instrument definitions
 * @param marketRates  Observed rates of these instruments
 * @param interp       Interpolation settings (applied to log-discount factors)
 * 
 * @return A discount functor.
 */
function buildYieldCurve(instruments: Instrument[], marketRates: number[], interp: InterpSettings): Discount {

	var ts = [0];
	for (var i = 0; i < instruments.length; i++) {
		ts.push(instruments[i].maturity());
	}

	var spline = new BSpline(ts, interp.degree, interp.conditions);

	var n = instruments.length;
	var p = interp.degree;
		
	// We solve for weights[], which contains the weights
	// applied to the b-spline bases.
	//
	// The constraints are:
	// F[0]    : == 0 by construction
	// F[1..n] : corresponds to each instrument 
	// F[n+1..n+p-1] : derivative condition, always == 0
	var weights = numeric.rep([n + p], 0);
	var discount = function(t: number, deriv?: number[]): number {
		var c = spline.evaluate(t);
		var F = numeric.dot(c, weights);
		var df = Math.exp(-F);
		if (typeof (deriv) !== 'undefined') {
			deriv.length = 0;
			for (var i = 0; i < c.length; i++)
				deriv[i] = -df * c[i];
		}
		return df;
	}
		
	// Use Newton's method to solve it. For each step, we solve
	// linear equation J*delta=marketRates-impliedRates, where
	//
	//   J:     (n+p)-by-(n+p) square matrix
	//   delta: (n+p)-by-1 vector of adjustments to be applied to weights[0..n+p-1]
	//
	var J = [];
	for (var i = 0; i < n + p; i++) {
		J[i] = numeric.rep([n + p], 0);
	}
	var impliedRates = numeric.rep([n], 0);
		
	// We start with all weights equal to zero.
	while (true) {
			
		// n conditions for each input instrument.
		for (var i = 0; i < n; i++) {
			var impliedRateDeriv = [];
			var impliedRate = instruments[i].impliedRate(discount, impliedRateDeriv);
			J[i] = impliedRateDeriv;
			impliedRates[i] = impliedRate;
		}
			
		// Check tolerance.
		var diff = numeric.sub(marketRates, impliedRates);
		var maxDiff = Math.max.apply(null, diff.map(Math.abs));
		var eps = 1.0e-8; // 0.0001 bp
		if (maxDiff < eps)
			break;
		//alert(maxDiff);

		// Additional constraints...
		var rhs = diff.slice();
			
		// 1 condition for F(0) == 0.
		J[n] = spline.evaluate(0);
		rhs[n] = 0;
			
		// (p-1) conditions on derivatives; we always assume
		// them to be equal to zero.
		var C = spline.coefficients();
		for (var i = n + 1; i < n + p; i++) {
			J[i] = C[i];
			rhs[i] = 0;
		}
			
		// Solve the equation.
		var delta = numeric.solve(J, rhs);
		numeric.addeq(weights, delta);
	}
	return discount;
}