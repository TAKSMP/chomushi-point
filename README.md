# ちょうむしポイント

家族で昆虫探しを楽しみながら、プレイヤーごとのポイントを記録するスマートフォン向け PWA です。
家族共通のログインで、どの端末からでも同じ名前・累計ポイント・ゲーム履歴を見られます（Supabase に保存）。

- フロント: Vite + React + TypeScript、PWA（vite-plugin-pwa）
- バックエンド: Supabase（Auth ＋ Postgres ＋ 行単位アクセス制御 RLS）
- 秘密情報はブラウザーに入れません。ブラウザーが使うのは公開用の URL と publishable（anon）キーだけで、家族ごとのデータ分離は DB の RLS で強制しています。

## 現在の公開環境

| 項目 | 値 |
| --- | --- |
| 公開URL | https://taksmp.github.io/chomushi-point/ |
| GitHub | https://github.com/TAKSMP/chomushi-point （`main` に push すると GitHub Actions で自動デプロイ） |
| Supabase | プロジェクト `chomushi-point`（TAKSMP's Org / Free / Tokyo）。URL・publishable キーは `.env.production` |
| Auth Site URL | https://taksmp.github.io/chomushi-point/ |

---

## 1. 必要なもの

| もの | 用途 |
| --- | --- |
| Node.js 20 以上 | ビルド・開発サーバー |
| Supabase アカウント（無料プランで可） | 認証とデータベース |
| 静的ホスティング（Vercel / Netlify / Cloudflare Pages など） | 公開（HTTPS 必須：PWA のため） |

## 2. すぐ画面を試す（Supabase なし・おためしモード）

```bash
npm install
cp .env.example .env.local
# .env.local の VITE_DEMO_MODE=true にする（URL / KEY 行は消すか空に）
npm run dev
```

おためしモードはこの端末のブラウザーだけに保存されます（共有・バックアップなし）。**本番では使わないでください。**

## 3. Supabase の初期設定（管理者が一度だけ）

1. https://supabase.com でアカウントを作り、**New project** を作成（リージョンは Tokyo 推奨）。DB パスワードは自分で保管し、アプリには書きません。
2. **SQL Editor** を開き、`supabase/migrations/20261121000000_init.sql` の中身を全部貼り付けて **Run**。
   - テーブル・RLS ポリシー・ビュー・関数（RPC）が作成されます。
   - Supabase CLI を使う場合は `supabase link --project-ref <ref>` → `supabase db push` でも同じです。
3. **Authentication → Sign In / Providers → Email** が有効なことを確認。
   - **Confirm email** が ON（既定）の場合、アカウント作成後に届くメールのリンクを開いてからログインします。家族用に1回だけなので ON のままで構いません。
   - **Authentication → URL Configuration** の **Site URL** に公開 URL（例 `https://chomushi.example.com`）を入れ、開発中は `http://localhost:5173` も **Redirect URLs** に追加します（確認メールのリンク先）。
   - 家族以外にアカウントを作らせたくない場合は、家族アカウント作成後に **Allow new users to sign up** を OFF にしてください（既存アカウントのログインはそのまま使えます）。
4. **Project Settings → API（Data API / API Keys）** で次の2つを控えます。
   - Project URL → `VITE_SUPABASE_URL`
   - Publishable key（`sb_publishable_...`）→ `VITE_SUPABASE_PUBLISHABLE_KEY`
     （古いプロジェクトでは anon public key。その場合は `VITE_SUPABASE_ANON_KEY`）
   - ⚠ `service_role` / `secret` キーは**絶対に**使わないでください（RLS を素通りする管理者キーです）。
5. Data API で `public` スキーマが公開されていることを確認します（既定で公開）。

## 4. ローカル起動

```bash
npm install
cp .env.example .env.local     # 値を入れる（.env.local は git に入りません）
npm run dev                    # http://localhost:5173
```

最初の画面で「はじめての かぞくは こちら」から家族アカウント（メール＋パスワード）を作ります。
家族の他の端末では、同じメールとパスワードでログインします。ログイン直後に家族データ（`families`）が自動で作られます。

## 5. デプロイ

静的サイトとしてビルドして配信します（ハッシュルーティングなのでリライト設定は不要）。

```bash
npm run build      # 型チェック + dist/ に出力
npm run preview    # 本番ビルドの確認
```

- **Vercel**: リポジトリを Import → Framework: Vite → Environment Variables に `VITE_SUPABASE_URL` と `VITE_SUPABASE_PUBLISHABLE_KEY` を設定 → Deploy。
- **Netlify / Cloudflare Pages**: Build command `npm run build`、Publish directory `dist`、同じ環境変数を設定。
- デプロイ後、Supabase の **Site URL / Redirect URLs** に本番 URL を追加。
- スマホで開き、Safari は「共有 → ホーム画面に追加」、Android Chrome は「ホーム画面に追加 / インストール」。

`VITE_` で始まる値はビルド時にブラウザー用コードへ埋め込まれます。ここに入れてよいのは上の2つ（公開前提の値）だけです。

## 6. データ設計

| テーブル | 内容 |
| --- | --- |
| `families` | 家族アカウント |
| `family_members` | ログインユーザー ⇔ 家族（1ユーザー1家族） |
| `players` | 登録プレイヤー（安定した UUID・表示名・作成日時。家族内で名前は重複不可） |
| `game_sessions` | ゲームセッション（`in_progress` / `completed`、開始・終了日時） |
| `game_participants` | 参加者ごとの途中ポイント（再開用）と終了時の最終ポイント |

- **累計ポイント**は保存せず、`player_totals` ビューで「完了ゲームの最終ポイントの合計」から常に再計算します。ゲーム途中の操作は累計に入りません。
- **グラフ**は `completed_results` ビュー（完了ゲーム × 参加者の最終ポイントと終了日時）を、端末側で半月（1〜15日／16日〜月末）ごとに合算します。期間の上限はなく、横スクロールで過去まで見られます。
- **冪等性**: ゲーム ID はクライアントで UUID を発行。`start_game` は同じ ID の再送を無視し、`complete_game` は行ロックのうえ「未完了のときだけ」確定します。2回目以降は保存済みの結果を返すだけなので、連打・再送・通信切れ後の再試行でも累計は一度しか増えません。
- **オフライン時**: 終了処理は端末のキューに入り、通信が戻ったとき（起動時・前面復帰時・オンライン復帰時）に自動再送されます。進行中のゲームも端末に一時保存し、クラウドにも操作のたびに（0.7 秒まとめて）保存するので、再読込や別端末から「つづける」ができます。
- **アクセス制御**: すべての行に `family_id` を持たせ、RLS で「自分の家族の行だけ」読めるようにしています。ゲーム系テーブルは直接書き込み不可で、家族チェック付きの関数（`SECURITY DEFINER`）経由のみ。参加者行は複合外部キーでセッション・プレイヤーと同じ家族であることを DB が保証します。`anon` には何の権限もありません。
- **名前の削除**: `delete_player` で、その人の参加記録（＝累計・履歴・グラフ）を一緒に削除し、参加者がいなくなったゲームも削除します。他の人のポイントは変わりません。

### DB テスト

ローカルの PostgreSQL 16 があれば、Supabase の auth スキーマを模したスタブ上でマイグレーションと RLS・冪等性のテストを実行できます。

```bash
createdb chomushi_test
DB=postgres:///chomushi_test scripts/test-db.sh   # → ALL TESTS PASSED
npm test                                          # 集計・順位・半月区分・再送キューの単体テスト
```

## 7. 画面

| 画面 | 内容 |
| --- | --- |
| ログイン | 家族アカウントでログイン／作成 |
| ホーム | 「みんなのポイント」「むしさがし」、右上の歯車で設定。途中のゲームがあれば「つづける／やめる」 |
| むしさがし（準備） | 1〜6人を選ぶ → 登録済みの名前から選ぶ／新しい名前をその場で登録（同じ人は重複不可）→ スタート（全員0ポイントから） |
| むしさがし（ゲーム） | 名前を押して複数選択（もう一度押すと解除・操作後も選択は維持）。「たす（黄）／ひく（赤）」切替、1〜10000 のポイントボタン。0未満にはならない。「ゲームおわり」は確認つき |
| こんかいの けっか | 高い順に表彰（同点は同じ順位）。終了ポイントを一度だけ累計に加算 |
| みんなのポイント | 名前・ごうけい・半月ごとのグラフ（横スクロール、最新が右） |
| せってい | 名前の追加・変更・削除（削除は影響する累計・回数を表示して確認）、ログアウト |

## 8. 素材について

- `assets/` と `reference/` はキットの原本です。アプリが使うのは `public/img/`（切り出し・WebP 変換済み）と `public/icons/`（PWA アイコン）です。
- 素材を差し替えたら `npm run assets` で再生成します（`scripts/build-assets.mjs` に共通素材シートの切り出し座標があります）。
- 画面見本の文字や数値は画像から使わず、すべて HTML/CSS で描いています。

## 9. ファイル構成

```
src/
  lib/scoring.ts        加減点・順位・半月集計（純粋関数）
  lib/supabaseRepo.ts   Supabase との通信
  lib/demoRepo.ts       おためしモード
  lib/gameStore.ts      進行中ゲームの端末キャッシュと終了処理の再送キュー
  screens/              各画面
  styles.css            森・木・紙・葉のスタイル
supabase/migrations/    スキーマ・RLS・RPC
supabase/tests/         DB テスト
scripts/                素材生成・DB テスト
```
