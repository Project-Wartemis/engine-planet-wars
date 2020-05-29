export default interface Move {
  id: number;
  source: number;
  target: number;
  player: string;
  ships: number;
  turns: number;
}
