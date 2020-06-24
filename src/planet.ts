import { Army } from './interface';

export class Planet {

  private armies: Array<Army> = [];

  constructor(
    public id: number,
    public name: string,
    public x: number,
    public y: number,
    public player: string,
    public ships: number,
  ) { }

  public toJSON(): object {
    return {
      id: this.id,
      name: this.name,
      x: this.x,
      y: this.y,
      player: this.player,
      ships: this.ships,
    };
  }

  public resetArmies(): void {
    this.armies = [{
      player: this.player,
      ships: this.ships,
    } as Army];
  }

  public addArmy(army: Army): void {
    const match = this.armies.find(a => a.player === army.player);
    if(match) {
      match.ships += army.ships;
    } else {
      this.armies.push(army);
    }
  }

  public processFight(neutralPlayer: string): void {
    if(this.armies.length < 2) {
      return;
    }
    this.armies.sort((a, b) => b.ships - a.ships);
    this.ships = this.armies[0].ships - this.armies[1].ships;
    this.player = this.ships === 0 ? neutralPlayer : this.armies[0].player;
  }

}
