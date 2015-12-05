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
		var F = zeroVector(n + p); // extra condition F(0) = 0
		
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
		//   J:     n-by-n square matrix
		//   delta: n-by-1 vector of adjustments to be applied to weights[1..n]
		//
		var J = [];
		for (var i = 0; i < n; i++) {
			J[i] = zeroVector(n);
		}
		var impliedRates = zeroVector(n);
		
		// We start with all weights equal to zero.
		while (true) {
			
			for (var i = 0; i < n; i++) {
				var impliedRateDeriv = [];
				var impliedRate = instruments[i].impliedRate(discount, impliedRateDeriv);
				for (var j = 0; j < n; j++) {
					J[i][j] = impliedRateDeriv[j+1];
				}
				impliedRates[i] = impliedRate;
			}
			
			var diff = numeric.sub(marketRates, impliedRates);
			var maxDiff = -Infinity;
			for (var j = 0; j < n; j++) {
				maxDiff = Math.max(maxDiff, Math.abs(diff[j]));
			}
			var eps = 1.0e-8; // 0.0001 bp
			if (maxDiff < eps)
				break;
			alert(maxDiff);

			var delta = numeric.solve(J, diff);
			for (var j = 0; j < n; j++) {
				weights[j+1] += delta[j];
			}
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
		
		var accrualFactor = 0.25;
		var finalDfDeriv = [];
		var finalDf = discount(T, finalDfDeriv);
		
		var annuityFactorDeriv = numeric.dot(finalDfDeriv, accrualFactor);
		var annuityFactor = accrualFactor * finalDf;
		for (var t = T - accrualFactor; t > 0; t -= 0.25) {
			var dfDeriv = [];
			var df = discount(t, dfDeriv);
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