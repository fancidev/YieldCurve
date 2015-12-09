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

	identity(n: int): matrix;

	linspace(a: number, b: number, n: number): number[];

	mul(x: vector, y: number): vector;
	mul(x: number, y: vector): vector;
	mul(x: matrix, y: number): matrix;
	mul(x: number, y: matrix): matrix;

	muleq(x: vector, y: number): vector;
	muleq(x: matrix, y: number): matrix;

	prettyPrint(x: any): string;

	rep<T>(dim: int[], val: T): T[];

	same(x: any, y: any): boolean;

	solve(A: matrix, b: vector): vector;

	sub(x: vector, y: vector): vector;

	subeq(x: vector, y: vector): vector;
}

declare var numeric: Numeric;