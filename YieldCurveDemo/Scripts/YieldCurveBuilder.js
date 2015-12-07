// interface InterpSettings {
// 	degree: number;
// 	conditions?: BSplineConstraint[];
// }
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
function buildYieldCurve(instruments, marketRates, interp) {
    var p = interp.degree;
    var ts = [0];
    for (var i = 0; i < instruments.length; i++) {
        ts.push(instruments[i].maturity());
    }
    var spline = new BSpline(ts, p, true);
    var n = instruments.length;
    // We solve for weights[], i.e the weights applied to b-spline bases.
    //
    // The constraints are:
    // Constraint [0]          : F(0) == 0 by construction
    // Constraint [1..n]       : corresponds to each instrument
    // Constraint [n+1..n+p-1] : boundary derivative condition, always == 0
    var m = spline.basisCount();
    var weights = numeric.rep([m], 0);
    // Creates a Discount functor for use by Instruments.
    var discount = function (t, deriv) {
        var c = spline.evaluate(t);
        var F = numeric.dot(c, weights);
        var df = Math.exp(-F);
        if (deriv) {
            deriv.length = 0;
            for (var i = 0; i < c.length; i++)
                deriv[i] = -df * c[i];
        }
        return df;
    };
    // Use Newton's method to solve it. For each step, we solve
    // linear equation J*delta=marketRates-impliedRates, where
    //
    //   C:     m-by-m square matrix, where the first n rows are
    //          the Jacobian of instrument rates with respect to
    //          spline weights, and the rest rows are boundary
    //          conditions. 
    //
    //   delta: m-by-1 vector of adjustments to apply to weights.
    //
    // We start with all weights equal to zero.
    while (true) {
        var C = [];
        var b = [];
        // Constraint 0: F(0) === 0.
        C[0] = spline.evaluate(0);
        b[0] = 0;
        // Constraints [1..n]: one for each input instrument.
        var impliedRates = numeric.rep([n], 0);
        for (var i = 0; i < n; i++) {
            var impliedRateDeriv = [];
            var impliedRate = instruments[i].impliedRate(discount, impliedRateDeriv);
            C[i + 1] = impliedRateDeriv;
            impliedRates[i] = impliedRate;
        }
        // Check tolerance.
        var diff = numeric.sub(marketRates, impliedRates);
        var maxDiff = Math.max.apply(null, diff.map(Math.abs));
        var eps = 1.0e-8; // 0.0001 bp
        if (maxDiff < eps)
            break;
        b.push.apply(b, diff);
        //alert(maxDiff);
        // Remaining constraints: (p-1) conditions on derivatives.
        // We always assume them to be equal to zero.
        var conditions = interp.conditions;
        for (var i = 0; i < conditions.length; i++) {
            var _a = conditions[i], knotIndex = _a.knotIndex, derivOrder = _a.derivOrder, _b = _a.derivValue, derivValue = _b === void 0 ? 0 : _b;
            var x = ts[(knotIndex >= 0) ? knotIndex : ts.length + knotIndex];
            var y = derivValue;
            var order = derivOrder;
            C[n + i + 1] = spline.evaluate(x, order);
            b[n + i + 1] = y;
        }
        // Solve the equation.
        var delta = numeric.solve(C, b);
        numeric.addeq(weights, delta);
    }
    return discount;
}
