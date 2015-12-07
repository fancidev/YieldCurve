declare type vector = number[];
declare type matrix = number[][];

interface Numeric {

	add(x: vector, y: vector): vector;

	addeq(x: vector, y: number): vector;
	addeq(x: vector, y: vector): vector;

	dot(x: number, y: vector): vector;
	dot(x: vector, y: number): vector;
	dot(x: vector, y: vector): number;

	linspace(a: number, b: number, n: number): number[];

	muleq(x: vector, y: number): vector;

	rep<T>(dim: vector, val: T): T[];

	solve(A: matrix, b: vector): vector;

	sub(x: vector, y: vector): vector;

	subeq(x: vector, y: vector): vector;
}

declare var numeric: Numeric;