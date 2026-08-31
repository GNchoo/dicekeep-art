/* 캐주얼 킹덤러쉬/랜덤다이스 톤 — 1차 아트팩 + 100스테이지 데이터 */
window.DKCONTENT = (function () {
  const maps = [
    { key: 'cMap1', src: 'casual/maps/map-01-meadow.jpg', name: '꽃초원' },
    { key: 'cMap2', src: 'casual/maps/map-02-candy.jpg', name: '사탕숲' },
    { key: 'cMap3', src: 'casual/maps/map-03-beach.jpg', name: '햇살해변' },
    { key: 'cMap4', src: 'casual/maps/map-04-snow.jpg', name: '눈마을' },
    { key: 'cMap5', src: 'casual/maps/map-05-autumn.jpg', name: '호박농장' },
    { key: 'cMap6', src: 'casual/maps/map-06-night.jpg', name: '달빛버섯' },
  ];
  const towerSkins = {
    1: [{ key: 'cT1a', src: 'casual/towers/t1-a.png' }, { key: 'cT1b', src: 'casual/towers/t1-b.png' }],
    2: [{ key: 'cT2a', src: 'casual/towers/t2-a.png' }, { key: 'cT2b', src: 'casual/towers/t2-b.png' }],
    3: [{ key: 'cT3a', src: 'casual/towers/t3-a.png' }, { key: 'cT3b', src: 'casual/towers/t3-b.png' }],
    4: [{ key: 'cT4a', src: 'casual/towers/t4-a.png' }],
    5: [{ key: 'cT5a', src: 'casual/towers/t5-a.png' }],
    6: [{ key: 'cT6a', src: 'casual/towers/t6-a.png' }],
  };
  const bases = [
    { id: 'slime', name: '슬라임', hp: 28, speed: 50, gold: 5, dmg: 1, size: 40, move: 'ground', sprite: 'cSlime', src: 'casual/enemies/slime.png' },
    { id: 'shroom', name: '버섯돌이', hp: 36, speed: 42, gold: 6, dmg: 1, size: 44, move: 'ground', sprite: 'cShroom', src: 'casual/enemies/shroom.png' },
    { id: 'pig', name: '돼지산적', hp: 48, speed: 46, gold: 7, dmg: 1, size: 48, move: 'ground', sprite: 'cPig', src: 'casual/enemies/pig.png' },
    { id: 'chicken', name: '닭기사', hp: 40, speed: 62, gold: 7, dmg: 1, size: 46, move: 'ground', sprite: 'cChicken', src: 'casual/enemies/chicken.png' },
    { id: 'goblin', name: '고블린', hp: 34, speed: 70, gold: 8, dmg: 1, size: 44, move: 'ground', sprite: 'cGoblin', src: 'casual/enemies/goblin.png' },
    { id: 'bee', name: '꿀벌창병', hp: 22, speed: 88, gold: 8, dmg: 1, size: 42, move: 'air', sprite: 'cBee', src: 'casual/enemies/bee.png' },
    { id: 'balloon', name: '풍선임프', hp: 30, speed: 64, gold: 9, dmg: 1, size: 50, move: 'air', sprite: 'cBalloon', src: 'casual/enemies/balloon.png' },
    { id: 'bat', name: '가방박쥐', hp: 26, speed: 96, gold: 9, dmg: 1, size: 40, move: 'air', sprite: 'cBat', src: 'casual/enemies/bat.png' },
    { id: 'mole', name: '두더지광부', hp: 44, speed: 54, gold: 8, dmg: 1, size: 44, move: 'burrow', sprite: 'cMole', src: 'casual/enemies/mole.png' },
    { id: 'worm', name: '모래벌레', hp: 55, speed: 40, gold: 10, dmg: 2, size: 50, move: 'burrow', sprite: 'cWorm', src: 'casual/enemies/worm.png' },
    { id: 'arma', name: '아르마딜로', hp: 70, speed: 38, gold: 11, dmg: 2, size: 48, move: 'burrow', sprite: 'cArma', src: 'casual/enemies/arma.png' },
  ];
  const bossBases = [
    { id: 'kingSlime', name: '슬라임왕', hp: 720, speed: 28, gold: 90, dmg: 4, size: 86, move: 'ground', sprite: 'cKingSlime', src: 'casual/bosses/king-slime.png' },
    { id: 'diceDragon', name: '주사위용', hp: 980, speed: 30, gold: 120, dmg: 5, size: 92, move: 'air', sprite: 'cDiceDragon', src: 'casual/bosses/dice-dragon.png' },
    { id: 'ogreChef', name: '주사위요리사', hp: 1100, speed: 24, gold: 130, dmg: 5, size: 90, move: 'ground', sprite: 'cOgreChef', src: 'casual/bosses/ogre-chef.png' },
  ];
  const ADJ = ['꼬마','숲','사탕','해변','눈꽃','달빛','황금','그림자','불꽃','이슬','돌','바람','꿀','구름','별','호박','산호','이끼','진주','장난','민트','코코아','벚꽃','밤하늘','햇살'];
  const RANK = ['신병','정찰','순찰','특공','정예','대장','파수','약탈','유랑','친위'];
  const species = [];
  for (let i = 0; i < 500; i++) {
    const b = bases[i % bases.length];
    const name = ADJ[i % ADJ.length] + ' ' + b.name + ' ' + RANK[Math.floor(i / bases.length) % RANK.length];
    species.push({ id: i, name, base: b.id, hue: (i * 47) % 360, hpM: 1 + (i % 7) * 0.06, spM: 1 + (i % 5) * 0.04 });
  }
  const BOSS_TITLE = ['왕','대공','폭군','제왕','군주','대장','수호신','악당','전설','우두머리'];
  const bosses = [];
  for (let i = 0; i < 100; i++) {
    const b = bossBases[i % bossBases.length];
    bosses.push({
      id: i,
      name: ADJ[i % ADJ.length] + ' ' + b.name + ' ' + BOSS_TITLE[i % BOSS_TITLE.length],
      base: b.id,
      hue: (i * 33) % 360,
      hpM: 1 + i * 0.08,
    });
  }
  return { maps, towerSkins, bases, bossBases, species, bosses, mapCount: 50, stageCount: 100 };
})();
