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
	dot(x: number, y: matrix): matrix;
	dot(x: matrix, y: number): matrix;

	identity(n: int): matrix;

	linspace(a: number, b: number, n: number): number[];

	muleq(x: vector, y: number): vector;

	rep<T>(dim: int[], val: T): T[];

	same(x: any, y: any): boolean;

	solve(A: matrix, b: vector): vector;

	sub(x: vector, y: vector): vector;

	subeq(x: vector, y: vector): vector;
}

declare var numeric: Numeric;