const electron = require('electron');
const url = require('url');
const path = require('path');
let {
  writeFile,
  readFile,
  createReadStream,
  createWriteStream,
  unlink
} = require('fs');

const crypto = require('crypto');

global.Promise = require('bluebird');

writeFile = Promise.promisify(writeFile);
readFile = Promise.promisify(readFile);
unlink = Promise.promisify(unlink);

const isEnvSet = 'NODE_ENV' in process.env;

if (!isEnvSet) process.env.NODE_ENV = "production";

const isDev = process.env.NODE_ENV !== "production";
const {app, BrowserWindow, ipcMain} = electron;

if (isDev) {
  //require('electron-reload')(__dirname);
}

class Application {

  constructor() {
    this.setFlash();
    this.eventsListeners();
  }

  eventsListeners() {
    // слушаем готовность приложения
    app.on('ready', () => {
      this.mainWindow = new BrowserWindow({
        width: 1180,
        height: 860,
        //resizable: false,
        center: true,
        icon: "images/favicon.png",
        webPreferences: {
          plugins: true,
          //sandbox: true
        }
        //frame: false
      });
      // отключайем под меню
      // mainWindow.setMenu(null);
      this.mainWindow.loadURL(url.format({
        pathname: path.join(__dirname, 'index.html'),
        protocol: 'file:',
        slashes: true
      }));
    });
    // слушатель добавления песен
    ipcMain.on('add-song', (event, newSongData) => {
      // проверяем верный ли пришол аудио файл и поддерживаем ли мы его
      if (!this.isSupportAudioFile(newSongData.song)) {
        return event.sender.send('add-song-response', { error: true, msg: 'Это не аудио файл или такой формат не поддерживается' });
      }
      // считываем старое состояния файла базы
      return readFile('db.json', 'utf-8')
      .then(data => JSON.parse(data))
      .then(db => {
        // если бд до этого была пустая или не существовала, то создаем стартовую структуру
        if (!db.songs || !db.songs.length) {
          db.songs = [];
        }

        const pathSong = newSongData.song;
        // вырезаем формат песни
        const fileFormat = this.getFileFormat(pathSong);
        // если вдруг формат не нашли - сообщаем пользователю
        if (!fileFormat) {
          return event.sender.send('add-song-response', { error: true, msg: 'Ошибка поиска формата песни.' });
        }
        // создаю уникальное имя звукового файла
        const sha1 = crypto.createHash('sha1');
        sha1.update(newSongData.name + Math.ceil(Math.random(1, 1000) * 10000) + (+new Date()).toString());
        newSongData.hash = sha1.digest('hex');
        newSongData.audioName = newSongData.hash + fileFormat;
        // удаляем ненужный нам параметр
        delete newSongData.song;

        console.log('audioName = ', newSongData.audioName);
        // добавляем данные песни в список
        db.songs.push(newSongData);
        // собираем JSON
        const json = JSON.stringify(db);
        // записываем в файл базы
        return writeFile('db.json', json, 'utf8')
        .then(() => {

          // копируем файл в нужную нам папку
          const stream = createReadStream(pathSong);

          stream.pipe(createWriteStream(`audio/${newSongData.audioName}`));

          stream.on('end', () => {
            console.log('copy file finish');
            console.log('song added');
            return event.sender.send('add-song-response', { success: true, msg: 'Песня добавлена' });
          })
          stream.on('error', err => {
            console.log('error = ', err);
            return event.sender.send('add-song-response', { error: true, msg: 'Ошибка при загрузке песни. Возможно приложению не хватает прав для выполнения текущей операции' });
          });

        });
      })
      .catch(err => {
        console.log('err = ', err);
        return event.sender.send('add-song-response', { error: true, msg: 'Произошла ошибка при работе с данными. Возможно файл с данными отсутствует.' });
      });

    });
    ipcMain.on('get-songs', (event, data) => {
      this.getSongs()
      .then(db => {
        return event.sender.send('set-songs', { success: true, db });
      })
      .catch(err => {
        console.log('error load songs');
        return event.sender.send('set-songs', { error: true, msg: 'Ошибка загрузки списка песен' });
      })
    });
    // удаление песни
    ipcMain.on('delete-song', (event, data) => {
      const hash = data.hash;

      this.getSongs()
      .then(db => {
        const songIndex = db.songs.findIndex(song => song.hash === hash);
        const song = db.songs[songIndex];

        db.songs = db.songs.filter(song => song.hash !== hash);

        const json = JSON.stringify(db);
        // записываем в файл базы
        return writeFile('db.json', json, 'utf8')
        .then(() => unlink('audio/' + song.audioName))
        .then(() => {
          event.sender.send('deleted-song', { success: true, msg: 'Песня удалена', hash });
        })
      })
      .catch(err => {
        console.log('error delete song');
        return event.sender.send('set-songs', { error: true, msg: 'Ошибка удаления песни' });
      })

    });
  }

  getSongs() {
    // считываем старое состояния файла базы
    return readFile('db.json', 'utf-8')
    .then(data => JSON.parse(data))
    .then(db => {
      // если бд до этого была пустая или не существовала, то создаем стартовую структуру
      if (!db.songs || !db.songs.length) {
        db.songs = [];
      }
      return db;
    });
  }

  isSupportAudioFile(name) {
    return /.[mp3|wma|aac|wav|flac]$/.test(name);
  }

  getFileFormat(name) {
    const format = name.match(/(\.[A-z0-9]+)$/);
    if (typeof format[0] === 'string') {
      return format[0];
    }
    return null;
  }

  setFlash() {
    switch (process.platform) {
      case 'win32': this.pluginName = 'pepflashplayer.dll'; break
      case 'darwin': this.pluginName = 'PepperFlashPlayer.plugin'; break
      case 'linux': this.pluginName = 'libpepflashplayer.so'; break

      default: this.pluginName = 'pepflashplayer.dll';
    }

    app.commandLine.appendSwitch('ppapi-flash-path', `./${this.pluginName}`);
    app.commandLine.appendSwitch('ppapi-flash-version', '27.0.0.187');
  }

}

const application = new Application();