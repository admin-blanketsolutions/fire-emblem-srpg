import Phaser from 'phaser';

export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MainMenuScene' });
  }

  create(): void {
    const { width, height } = this.cameras.main;

    this.add.text(width / 2, height / 3, 'FIRE EMBLEM S-RPG', {
      fontSize: '40px',
      fontFamily: 'monospace',
      color: '#e8c96a',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2, 'CHAPTER 1', {
      fontSize: '24px',
      fontFamily: 'monospace',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
      .on('pointerover', function (this: Phaser.GameObjects.Text) { this.setStyle({ color: '#e8c96a' }); })
      .on('pointerout', function (this: Phaser.GameObjects.Text) { this.setStyle({ color: '#ffffff' }); })
      .on('pointerdown', () => this.scene.start('BattleScene'));

    this.add.text(width / 2, height * 0.85, 'Press START to begin', {
      fontSize: '14px',
      fontFamily: 'monospace',
      color: '#888888',
    }).setOrigin(0.5);
  }
}
