# うつし窓

Windows PC と iPhone・iPad の間で、画面をブラウザにリアルタイム表示する GitHub Pages 用サイトです。一度に1対1で接続します。逆方向に映すときは、接続を終了して2台の役割を入れ替えます。

## GitHub Pages に置く

1. ZIPを展開します。
2. GitHubでリポジトリを作り、`index.html`、`style.css`、`app.js`、`vendor/`、`README.md`、`.nojekyll` をリポジトリ直下にアップロードします。ZIPのままでは開けません。`index.html` はフォルダーの内側に入れず、リポジトリを開いて最初に見える場所に置きます。
3. リポジトリの **Settings → Pages** で **Deploy from a branch → main → / (root)** を選んで **Save**。ブランチ名が違うときは、ファイルを置いたブランチを選びます。
4. 同じ Pages 画面に表示された **https://** の公開URLを、2台で開きます。GitHubのコード閲覧画面やダウンロードしたHTMLを直接開く方法では、同じリンクでの接続を試せません。

参考 [GitHub Pages の公開元を設定する](https://docs.github.com/ja/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

## 使う

1. 最初は両方を同じWi-Fiにつなぎます。パソコンが有線でも、同じローカルネットワーク上なら試せます。
2. 送る端末で **画面を送る → 招待コードを作る**。
3. 見る端末でQRを読むか、公開URLを開いて **画面を見る** に切り替え、16文字のコードを入力します。iPhone・iPadからPCに送る場合は、PCでコードを入力するか、送る側で「招待リンクをコピー」してPCに送ります。
4. 送る側で **許可して画面を共有** を押し、ブラウザやOSの表示に従って共有対象を選びます。見る側で映像が出たら **全画面** を使えます。
5. 終わったらどちらかで **接続を終了**。送る端末のブラウザやOSにある共有停止操作でも終了できます。

Windowsで送るならChromeまたはEdgeを使います。iPhone・iPadで送る場合は Safari 27 以降が目安です。共有対象の選択肢や、ほかのアプリに切り替えた後の動作は端末とOSに依存します。見る側は画面取得APIを使わないため、Safari 27より前の環境でもWebRTCが使えれば受信できます。音声は送る側でチェックを入れ、ブラウザが選んだ共有元の音声を提供できる場合に限って届きます。

参考 [画面取得APIの対応表](https://caniuse.com/mdn-api_mediadevices_getdisplaymedia)

## QRでつながらないとき

QR・接続コードには公開の PeerServer Cloud を使います。映像はWebRTCで転送し、ネットワーク状況に応じてPeerJS標準の中継を使う場合があります。アカウント作成やAPIキーの設定は不要です。接続コードはその場で生成され、リポジトリやサイトには映像を保存しません。

公開の接続サービスを使わない場合は、両方で **手動（接続サービスなし）** を選びます。

1. 送る側で画面を選び、生成された長い「招待コード」を見る側に送ります。
2. 見る側でコードを貼り付け、生成された「応答コード」を送る側に返します。
3. 送る側で「応答コード」を貼り付けて **コードを読み込む** を押します。

手動接続は2台が直接通信できるローカルネットワーク向けです。ゲストWi-Fi、VPN、ファイアウォール、ブラウザのプライバシー設定によってはQR・手動ともに接続できないことがあります。招待リンクやコードは、映像を見せる相手にだけ渡してください。

## 同梱ライブラリ

- [PeerJS](https://peerjs.com/) 1.5.5（MIT、ライセンスは `vendor/peerjs.LICENSE`）
- [QR Code Generator](https://github.com/kazuhikoarase/qrcode-generator) 1.4.4（MIT、ライセンスは `vendor/qrcode.LICENSE`）
