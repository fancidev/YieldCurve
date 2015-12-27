'use strict';

interface YieldCurveModel {
	/**
	 * Gets a reference to the internal state vector of the model.
	 * Changing this vector will change the model.
	 */
    state(): number[];
	
	/**
	 * Returns the discount factor for a given time-to-maturity.
	 * @param t         Time-to-maturity, expressed in years.
	 * @param gradient  If supplied, returns the gradient vector of df with
	 *                  respect to the internal state vector.
	 * @returns Discount factor.  
	 */
    discount(t: number, gradient?: number[]): number;
	
	/**
	 * Gets model-dependent linear constraints imposed on the state vector.
	 * This is used by the Newton solver when fitting the model to market
	 * rates. It avoids the need to invert an internal matrix.
	 * 
	 * If this member is defined, it must return a tuple where the first
	 * element is an m-by-n matrix of linear coefficients and the second
	 * element is an m-by-1 vector of right-hand-side values. (n is the
	 * number of state variables.)
	 * 
	 * If this member is not defined, it is assumed to have no particular
	 * linear constraint. 
	 */
    constraints?(): [number[][], number[]];

	/**
	 * If there are more state variables than constraints, the Newton
	 * solver assumes the curve should be fit by optimizing a quadratic
	 * form z = 0.5 * s' * H * s where s is the state vector (of n
	 * elements) and H is an n-by-n positive definite matrix returned by
	 * this function.
	 * 
	 * Note that the returned matrix is not necessarily invertible.
	 */
    quadratic?(): number[][];
	
	/**
	 * Returns an HTML segment that describes the attributes of this model.
	 */
    info?(): string;
}

/**
 * Represents a partially-specified yield curve model, where the
 * only missing information is the instruments to fit to. Note
 * that the model may not use all the supplied instruments.
 */
interface YieldCurveModelTemplate {
	/**
	 * Gets the name of the model template.
	 */
    name: string;
	
	/**
	 * Creates a model that is ready to be fitted to market data.
	 * @param instruments  The tentitative instruments to fit to.
	 *                     If the model is not able to fit to all
	 *                     the data exactly, it should delete the
	 *                     instruments that it doesn't want to fit
	 *                     from this array.
	 */
    createModel(instruments: Instrument[]): YieldCurveModel;
}

/**
 * Fits the given yield curve model to observed market rates of a
 * set of instruments.
 * 
 * This function uses Newton's method to fit the model. It iterates
 * until the maximum deviation between market and model rates is no
 * more than 0.0001 basis point. If it does not converge within 100
 * iterations, it throw an error.
 * 
 * @param model        The yield curve model to fit
 * @param instruments  Instrument definitions
 * @param marketRates  Observed rates of these instruments
 */
function fitYieldCurve(model: YieldCurveModel, instruments: Instrument[], marketRates: number[]): Discount {

    const state = model.state();
    const p = state.length;

    const n = instruments.length;
    if (n !== marketRates.length) {
        throw new RangeError('instruments and marketRates must have the same length.');
    }

    const m = model.constraints ? model.constraints()[1].length : 0;
    if (n + m > p) {
        throw new RangeError("There are more constraints than state variables.");
    }

    const H = model.quadratic ? model.quadratic() : new Array<Array<number>>();
    if (H.length !== 0 && H.length !== p) {
        throw new RangeError("Quadratic matrix must have the same size as state vector.");
    }
    if (n + m < p && H.length === 0) {
        throw new RangeError("Quadratic coefficients must be supplied when there are not enough constraints.");
    }
	
    // Creates a closure of the discount function.
    function discount(t: number, gradient?: number[]): number {
        return model.discount(t, gradient);
    }
	
    // Use Newton's method to fit the model. In each iteration, we
    // solve a linear system C*delta=marketRates-impliedRates, where
    //
    //   C: an (n+m)-by-(n+m) matrix, where the first n rows is the
    //   Jacobian matrix, i.e. J[i][j] is the partial derivative of
    //   the i'th instrument with respect to the j'th state variable;
    //   the rest m rows are model-dependent linear constraints on
    //   the state variables; 
    //
    //   delta: (n+m)-by-1 vector of adjustments to be apply to the
    //   state vector after the iteration.
    //
    for (let iter = 1; iter <= 100; ++iter) {

        // Compute implied rates and Jacobian.
        const C = new Array<Array<number>>(n + m);
        const impliedRates = new Array<number>(n);
        for (let i = 0; i < n; i++) {
            const gradient = new Array<number>(n + m);
            const impliedRate = instruments[i].impliedRate(discount, gradient);
            C[i] = gradient;
            impliedRates[i] = impliedRate;
        }
			
        // Check tolerance.
        const diff = numeric.sub(marketRates, impliedRates);
        if (iter > 1) {
            // Perform at least one iteration in order to fit model-specific
            // linear constraints exactly.
            const maxDiff = Math.max.apply(null, diff.map(Math.abs));
            const eps = 1.0e-8; // 0.0001 bp
            if (maxDiff < eps) {
                console.log('Newton method found solution in ' + iter + ' iterations.');
                return discount;
            }
        }
        const b = diff;
		
        // Add model-dependent constraints.
        if (m > 0) {
            const [extraConstraints, extraValues] = model.constraints();
            for (let i = 0; i < m; i++) {
                C[n + i] = extraConstraints[i];
                b[n + i] = extraValues[i] - numeric.dot(C[n + i], state);
            }
        }
        
        // Add quadratic objective.
        if (H.length > 0) {
            const CC = numeric.mul(numeric.identity(n + m + p), 0);
            numeric.setBlock(CC, [0, 0], [p, p], H);
            numeric.setBlock(CC, [p, 0], [p + n + m, p], C);
            numeric.setBlock(CC, [0, p], [p, p + n + m], numeric.transpose(C));
            const bb = numeric.sub(0, numeric.dot(H, state));
            C.splice(0, C.length, ...CC);
            b.splice(0, 0, ...bb);
        }
		
        // Solve the equation.
        const delta = numeric.solve(C, b).slice(0, p);
        numeric.addeq(state, delta);
    }

    alert('Newton method cannot find solution');
    throw new Error('Newton method cannot find solution');
}