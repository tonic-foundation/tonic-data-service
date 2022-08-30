/**
 * Force all properties of a type T to be V.
 */
export type ForceProperties<T, V> = { [x in keyof T]: V };
