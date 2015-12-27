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

class DiscreteModelTemplate implements YieldCurveModelTemplate {

    public name: string;
    private interval: number;
    private maturity: number;
    private covar: number[][];

    constructor(name: string, maturity: number, interval: number) {
        this.name = name;
        this.maturity = maturity;
        this.interval = interval;
        this.covar = numeric.identity(maturity / interval - 1);
    }

    createModel(instruments: Instrument[]): YieldCurveModel {
        return new DiscreteModel(this.maturity, this.maturity / this.interval, this.covar);
    }
}

const discreteModelTemplates = [
    new DiscreteModelTemplate('Discrete', 30, 0.25)
];