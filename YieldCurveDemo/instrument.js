(function () {
	
	'use strict';
	
	////////////////////////////////////////////////////////////////
	// Yield curve builder
	//
	
	// Builds a yield curve.
	//
	// PARAMETERS
	//   instruments    Instrument definitions
	//   marketRates    Observed rates of these instruments
	//   interp         Interpolation settings (applied to log-
	//                  discount factors)
	// RETURN VALUE
	//   A discount functor.
	//
	function buildYieldCurve(instruments, marketRates, interp) {
		
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
		var weights = zeroVector(n + p);
		var discount = function (t, deriv) {
			var c = spline.evaluate(t);
			var F = numeric.dot(c, weights);
			var df = Math.exp(-F);
			if (typeof(deriv) !== 'undefined') {
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
		for (var i = 0; i < n+p; i++) {
			J[i] = zeroVector(n+p);
		}
		var impliedRates = zeroVector(n);
		
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
			var maxDiff = -Infinity;
			for (var j = 0; j < n; j++) {
				maxDiff = Math.max(maxDiff, Math.abs(diff[j]));
			}
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
			for (var i = n+1; i < n+p; i++) {
				J[i] = C[i];
				rhs[i] = 0;
			}
			
			// Solve the equation.
			var delta = numeric.solve(J, rhs);
			numeric.addeq(weights, delta);
		}
		return discount;
	}
	
	window.buildYieldCurve = buildYieldCurve;
	
	////////////////////////////////////////////////////////////////
	// FRA Instrument
	//
	
	// Creates a FRA of the given maturity. The rate is supposed 
	// to be continuously compounded.
	var Fra = function(maturity) {
		
		this._maturity = maturity;
	};
	
	// Returns the maturity (in years) of the instrument.
	Fra.prototype.maturity = function () {
		return this._maturity;
	}
	
	// Computes implied Fra rate off the given yield curve.
	//
	// PARAMETERS
	//  
	//   discount   A function of the following signature:
	//              discount(maturity, out deriv) => value
	//
	//   deriv      (output) receives derivative
	//
	Fra.prototype.impliedRate = function (discount, deriv) {
		
		var T = this._maturity;
		var dfDeriv = [];
		var df = discount(T, dfDeriv);
		var fraRate = -Math.log(df)/T;
		if (typeof(deriv) !== 'undefined') {
			deriv.length = 0;
			for (var i = 0; i < dfDeriv.length; i++)
				deriv[i] = -dfDeriv[i]/(T*df);
		}
		return fraRate;
	}
	
	window.Fra = Fra;
	
	////////////////////////////////////////////////////////////////
	// Ln(Df) Instrument
	//
	
	var LogDf = function(maturity) {
		
		this._maturity = maturity;
	};
	
	LogDf.prototype.maturity = function () {
		return this._maturity;
	}
	
	LogDf.prototype.impliedRate = function (discount) {
		
		var T = this._maturity;
		var df = discount(T);
		return -Math.log(df);
	}
	
	window.LogDf = LogDf;
	
	////////////////////////////////////////////////////////////////
	// Swap Instrument
	//
	
	// Creates an interest rate swap of the given maturity.
	// The fixed leg is supposed to be quarterly, 30/360.
	var Swap = function(maturity) {
		
		this._maturity = maturity;
	};
	
	// Returns the maturity (in years) of the instrument.
	Swap.prototype.maturity = function () {
		return this._maturity;
	}
	
	// Computes implied swap rate off the given yield curve.
	//
	// PARAMETERS
	//  
	//   discount   A function of the following signature:
	//              discount(maturity, out deriv) => value
	//
	//   deriv      (output) receives derivative
	//
	Swap.prototype.impliedRate = function (discount, deriv) {
		
		var T = this._maturity;
		
		var finalDfDeriv = [];
		var finalDf = discount(T, finalDfDeriv);
		
		var annuityFactorDeriv = zeroVector(finalDfDeriv.length);
		var annuityFactor = 0.0;
		var frequency = 0.25;
		for (var t = T; t > 0; t -= frequency) {
			var dfDeriv = [];
			var df = discount(t, dfDeriv);
			var accrualFactor = Math.min(frequency, t);
			annuityFactor += accrualFactor * df;
			numeric.addeq(annuityFactorDeriv, numeric.dot(accrualFactor, dfDeriv));
		}
		
		var swapRate = (1 - finalDf) / annuityFactor;
		var swapRateDeriv = numeric.dot(-1/annuityFactor, numeric.add(finalDfDeriv, numeric.dot(swapRate, annuityFactorDeriv)));
		if (typeof(deriv) !== 'undefined') {
			deriv.length = 0;
			for (var i = 0; i < swapRateDeriv.length; i++)
				deriv.push(swapRateDeriv[i]);
		}
		return swapRate;
	}
	
	window.Swap = Swap;
	
	////////////////////////////////////////////////////////////////
	// Helper Functions
	//
	
	function zeroVector(length)
	{
		var v = [];
		for (var i = 0; i < length; i++) {
			v.push(0);
		}
		return v;
	}
})();