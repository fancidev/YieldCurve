declare type vector = number[];
declare type matrix = number[][];

declare type int = number;

interface Numeric {

    add(x: vector, y: vector): vector;

    addeq(x: vector, y: number): vector;
    addeq(x: vector, y: vector): vector;

    clone(x: number): number;
    clone(x: vector): vector;
    clone(x: matrix): matrix;

    dim(x: vector): int[];
    dim(x: matrix): int[];

    dot(x: number, y: vector): vector;
    dot(x: vector, y: number): vector;
    dot(x: vector, y: vector): number;
    dot(x: matrix, y: vector): vector;
    dot(x: vector, y: matrix): vector;
    dot(x: matrix, y: matrix): matrix;

    identity(n: int): matrix;

    inv(x: number[][]): number[][];

    linspace(a: number, b: number, n: number): number[];

    mul(x: vector, y: number): vector;
    mul(x: number, y: vector): vector;
    mul(x: matrix, y: number): matrix;
    mul(x: number, y: matrix): matrix;

    muleq(x: vector, y: number): vector;
    muleq(x: matrix, y: number): matrix;

    prettyPrint(x: any): string;

    rep<T>(dim: int[], val: T): T[];
    //rep(dim: [int], val: number): vector;
    //rep(dim: [int, int], val: number): matrix;

    same(x: any, y: any): boolean;

    setBlock(x: vector, from: int, to: int, y: vector): void;
    setBlock(x: matrix, from: [int, int], to: [int, int], y: matrix): void;

    solve(A: matrix, b: vector): vector;

    sub(x: vector, y: vector): vector;
    sub(x: vector, y: number): vector;
    sub(x: number, y: vector): vector;

    subeq(x: vector, y: vector): vector;

    transpose(x: matrix): matrix;
}

declare var numeric: Numeric;