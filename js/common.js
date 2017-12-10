const {
  ipcRenderer,
  remote
} = require('electron');
const dialog = remote.dialog;

class App {
  constructor() {
    this.eventsListeners();
  }

  eventsListeners() {
    $(document).ready(this.documentReady);
    $(document).on('submit', '#add-song', this.addSong);
    $(document).on('click', 'input[name="song"]', this.showDialogLoadFile);
    $(document).on('click', '[delete-song]', this.deleteSong);

    ipcRenderer.on('add-song-response', this.addSongResponse);
    ipcRenderer.on('set-songs', (event, data) => this.setSongs(event, data));
    ipcRenderer.on('deleted-song', (event, data) => this.deletedSong(event, data));
  }

  documentReady() {
    //ipcRenderer.send('get-songs');
  }

  deleteSong() {
    const hash = $(this).closest('a').data('hash');

    ipcRenderer.send('delete-song', { hash });
  }

  deletedSong(event, data) {

    console.log('dalete = ', data);

    const $song = $('#songs-list').children(`a[data-hash="${data.hash}"]`);

    $song.slideUp(function () {
      $song.remove();
    });
  }

  setSongs(event, data) {
    console.log(data)
    // удаляем старый список песен, чтобы не было повторений
    $('#songs-list').children().remove();
    // рендерим новый список
    data.db.songs.forEach(song => {
      this.addSongInHtml(song);
    });
  }

  addSongInHtml(song) {
    $('#songs-list').append(`
      <a class="h_song"  data-hash="${song.hash}" aria-expanded="false" aria-controls="collapseExample" >
        <span class="close" delete-song>
            <span aria-hidden="true">×</span>
        </span>
         <h3 data-toggle="collapse" data-target="#collapse-${song.hash}">
            ${song.name}
         </h3>
      </a>
      <div class="collapse" id="collapse-${song.hash}">
          <div class="card card-body">
              <audio controls>
                  <source src="audio/${song.audioName}" type="audio/mpeg">
              </audio>
              <h5> <b>Исполнитель:</b> ${song.creator} </h5>
              <h5> <b>Жанры:</b> ${song.genres} </h5>
              <h5> <b>Текст песни:</b> </h5>
              <p><pre>${song.text}</pre></p>
              <h5> <b>Используемые аккорды:</b> ${song.accord}</h5>
          </div>
      </div>
    `);
  }

  notif(type, title, msg) {

    if (!type) throw new Error('type variable is not exist');
    if (!~['success', 'danger', 'warning', 'info'].indexOf(type)) throw new Error('unknown type');
    if (!msg) throw new Error('msg variable is not exist');

    const hash = Math.ceil(Math.random(1, 1000) * 10000) + (+new Date()).toString();

    $('#errors-block').html(`
      <div class="alert alert-${type}" role="alert" id="notif-${hash}">
        <strong>${title}</strong> ${msg}
      </div>
    `);

    setTimeout(function() {
      $(`#notif-${hash}`).slideUp();
    }, 3e3);


  }

  addSong(e) {
    e.preventDefault();

    const data = {
      name: $(this).find('[name="name"]').val(),
      creator: $(this).find('[name="creator"]').val(),
      genres: $(this).find('[name="genres"]').val(),
      song: app.filename,
      accord: $(this).find('[name="accord"]').val(),
      text: $(this).find('[name="text"]').val()
    };

    if (!data.name.length ||
        !data.creator.length ||
        !data.genres.length ||
        !data.song.length ||
        !data.accord.length ||
        !data.text.length
    ) {
      return app.notif('danger', 'Обязательно!', 'Заполнены не все поля.');
    }
    ipcRenderer.send('add-song', data);
    return false;
  }

  addSongResponse(event, data) {
    if (data.error) {
      return app.notif('danger', 'Успешно!', data.msg)
    }
    app.notif('success', 'Успешно!', data.msg)
    // очищаем поля
    $('form[name="add-song"]').find('input, textarea').val('');
    $('#input-song-text').attr('data-text', 'Выбрать песню...');
    $('#collapse-add-song').collapse('hide');
    ipcRenderer.send('get-songs');
  }

  showDialogLoadFile(e) {
    e.preventDefault();

    dialog.showOpenDialog(filenames => {
      if (filenames === undefined) {
        app.notif('warning', 'Обязательно!', 'Нужно выбрать файл');
        return;
      }
      console.log(filenames)
      app.filename = filenames[0];
      // показываем наглядно что мы выбрали файл
      $('#input-song-text').attr('data-text', filenames[0].substr(0, 20) + '...');
    })
  }
}

const app = new App();

