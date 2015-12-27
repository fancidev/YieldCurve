'use strict';

/**
 * Represents a discretized yield curve model which explicitly fits
 * the log discount factor at regular intervals.
 */
class DiscreteModel implements YieldCurveModel {

    private maturity: number;
    private n: int;
    private F: number[]; // state vector: log discount factor F_0 .. F_n
    private covar: number[][]; // covariance of forward rates f_1 .. f_{n-1}
    private H: number[][]; // L' Covar^{-1} L

    constructor(maturity: number, n: int, covar: number[][]) {
        const T = maturity;
        const delta = T / n;
        if (covar.length !== n - 1) {
            throw new RangeError('Covariance matrix must be ' + (n - 1) + '-by-' + (n - 1));
        }

        this.maturity = maturity;
        this.n = n;
        this.F = numeric.rep([n + 1], 0);
        this.covar = numeric.mul(covar, 1);

        const L = new Array<Array<number>>(n - 1);
        for (let i = 0; i < n - 1; i++) {
            L[i] = numeric.rep([n + 1], 0);
            L[i][i + 0] = 1;
            L[i][i + 1] = -2;
            L[i][i + 2] = 1;
        }
        const prec = numeric.inv(covar);
        this.H = numeric.dot(numeric.dot(numeric.transpose(L), prec), L);
    }

    state(): number[] {
        return this.F;
    }

    constraints(): [number[][], number[]] {
        return [
            [[1, ...numeric.rep([this.n], 0)]],
            [0]
        ];
    }

    quadratic(): number[][] {
        return this.H;
    }

    discount(t: number, gradient?: number[]): number {
        const k = t / (this.maturity / this.n);
        if (k < 0) {
            throw new RangeError('t cannot be negative');
        }
        if (k > this.n) {
            throw new RangeError('cannot extrapolate');
        }
        if (k === Math.floor(k)) { // k is integer
            const df = Math.exp(-this.F[k]);
            if (gradient) {
                gradient.splice(0, gradient.length, ...numeric.rep([this.n + 1], 0));
                gradient[k] = -df;
            }
            return df;
        }
        else { // Simple linear interpolation
            const k1 = Math.floor(k);
            const k2 = Math.ceil(k);
            const a = (k2 - k) / (k2 - k1);
            const F = this.F[k1] * a + this.F[k2] * (1 - a);
            const df = Math.exp(-F);
            if (gradient) {
                gradient.splice(0, gradient.length, ...numeric.rep([this.n + 1], 0));
                gradient[k1] = -df * a;
                gradient[k2] = -df * (1 - a);
            }
            return df;
        }
    }
}

type CovarianceFunction = (s: number, t: number) => number;

class DiscreteModelTemplate implements YieldCurveModelTemplate {

    public name: string;
    private interval: number;
    private maturity: number;
    private covar: CovarianceFunction;

    constructor(name: string, maturity: number, interval: number, covar: CovarianceFunction) {
        this.name = name;
        this.maturity = maturity;
        this.interval = interval;
        this.covar = covar;
    }

    createModel(instruments: Instrument[]): YieldCurveModel {
        const n = this.maturity / this.interval;
        const covarMatrix = numeric.mul(numeric.identity(n - 1), 0);
        const delta = this.interval;
        for (let i = 0; i < n - 1; i++) {
            for (let j = 0; j < n - 1; j++) {
                covarMatrix[i][j] = this.covar((i + 1) * delta, (j + 1) * delta);
            }
        }
        return new DiscreteModel(this.maturity, n, covarMatrix);
    }
}

const discreteModelTemplates = [
    new DiscreteModelTemplate('Discrete (i.i.d. log df)', 30, 0.25, function(s, t) {
        const delta = 0.25;
        if (s === t)
            return 1 + ((s === delta) ? 0 : 1);
        else if (Math.abs(s - t) === delta)
            return -1;
        else
            return 0;
    }),
    new DiscreteModelTemplate('Discrete (i.i.d. zc)', 30, 0.25, function(s, t) {
        const delta = 0.25;
        if (s === t)
            return s ** 2 + (s - delta) ** 2;
        else if (Math.abs(s - t) === delta)
            return -(Math.min(s, t) ** 2);
        else
            return 0;
    }),
    new DiscreteModelTemplate('Discrete (i.i.d. fwd)', 30, 0.25, (s, t) => (s === t) ? 1 : 0),
    new DiscreteModelTemplate('Discrete (const cor)', 30, 0.25, (s, t) => (s === t) ? 1 : 0.5),
    new DiscreteModelTemplate('Discrete (exp cor)', 30, 0.25, (s, t) => Math.exp(-Math.abs(s - t))),
    new DiscreteModelTemplate('Discrete (exp^2 cor)', 30, 0.25, (s, t) => Math.exp(-2 * ((s - t) ** 2))),
];