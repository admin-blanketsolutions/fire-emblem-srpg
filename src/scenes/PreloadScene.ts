import Phaser from 'phaser';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PreloadScene' });
  }

  preload(): void {
    // Progress bar
    const { width, height } = this.cameras.main;
    const bar = this.add.graphics();
    const box = this.add.graphics();

    box.fillStyle(0x222222).fillRect(width / 2 - 160, height / 2 - 15, 320, 30);

    this.load.on('progress', (value: number) => {
      bar.clear().fillStyle(0xe8c96a).fillRect(width / 2 - 158, height / 2 - 13, 316 * value, 26);
    });

    this.load.on('complete', () => {
      bar.destroy();
      box.destroy();
    });

    // Placeholder assets will be loaded here as real sprites are added
    this.generatePlaceholderTextures();
  }

  create(): void {
    this.scene.start('MainMenuScene');
  }

  private generatePlaceholderTextures(): void {
    // Generates placeholder colored squares until real sprites arrive
    const textures: Array<{ key: string; color: number }> = [
      { key: 'unit-ally', color: 0x4444ff },
      { key: 'unit-enemy', color: 0xff4444 },
      { key: 'tile-grass', color: 0x3a7d44 },
      { key: 'tile-forest', color: 0x1e5c28 },
      { key: 'tile-mountain', color: 0x7a6a5a },
      { key: 'tile-plain', color: 0x8db87f },
      { key: 'tile-fort', color: 0x888888 },
      { key: 'tile-castle', color: 0xaaaaaa },
    ];

    textures.forEach(({ key, color }) => {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.fillStyle(color).fillRect(0, 0, 32, 32);
      g.lineStyle(1, 0x000000, 0.3).strokeRect(0, 0, 32, 32);
      g.generateTexture(key, 32, 32);
      g.destroy();
    });
  }
}
