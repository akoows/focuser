import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { User, X } from 'lucide-react';
import { focuserApi } from '../services/focuserApi';
import { appendUniqueBooks } from './reading/bookPagination';
import { APP_ACCENT_PRESETS } from './settings/appThemeSettings';

const READING_BOOK_PAGE_SIZE = 50;

export default function ProfilePage({ embedded = false, onClose, onProfileUpdated, user, setUser, updateAccentColor, ProfileImageCropper, ProfileBookPicker, PageHeader, AppLayout }) {
  const profileAccentColor = /^#[\da-f]{6}$/i.test(user?.accentColor || '') ? user.accentColor : '#ffffff';
  const [name, setName] = useState(user?.name || '');
  const [username, setUsername] = useState(user?.username || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [currentBookId, setCurrentBookId] = useState(user?.currentBookId || '');
  const [favoriteBookId, setFavoriteBookId] = useState(user?.favoriteBookId || '');
  const [books, setBooks] = useState([]);
  const [booksPagination, setBooksPagination] = useState(null);
  const [isLoadingBooks, setIsLoadingBooks] = useState(true);
  const [isLoadingMoreProfileBooks, setIsLoadingMoreProfileBooks] = useState(false);
  const [booksError, setBooksError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [themeError, setThemeError] = useState('');
  const [isSavingTheme, setIsSavingTheme] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const [cropRequest, setCropRequest] = useState(null);
  const [avatarMessage, setAvatarMessage] = useState('');
  const [avatarError, setAvatarError] = useState('');
  const [bannerMessage, setBannerMessage] = useState('');
  const [bannerError, setBannerError] = useState('');
  const profileBooksRequestIdRef = useRef(0);

  useEffect(() => () => {
    if (cropRequest?.source) URL.revokeObjectURL(cropRequest.source);
  }, [cropRequest]);

  const closeCropEditor = useCallback(() => setCropRequest(null), []);

  useEffect(() => {
    const requestId = ++profileBooksRequestIdRef.current;
    let active = true;
    focuserApi.reading.listBooks({ status: 'all', page: '1', limit: String(READING_BOOK_PAGE_SIZE) })
      .then((response) => {
        if (!active || requestId !== profileBooksRequestIdRef.current) return;
        setBooks(response.items);
        setBooksPagination(response.pagination);
      })
      .catch((requestError) => {
        if (active && requestId === profileBooksRequestIdRef.current) setBooksError(requestError.message);
      })
      .finally(() => {
        if (active && requestId === profileBooksRequestIdRef.current) setIsLoadingBooks(false);
      });
    return () => {
      active = false;
      if (profileBooksRequestIdRef.current === requestId) profileBooksRequestIdRef.current += 1;
    };
  }, [user?.id]);

  const loadMoreProfileBooks = async () => {
    if (isLoadingMoreProfileBooks || !booksPagination || booksPagination.page >= booksPagination.totalPages) return;
    const requestId = profileBooksRequestIdRef.current;
    setIsLoadingMoreProfileBooks(true);
    setBooksError('');
    try {
      const response = await focuserApi.reading.listBooks({
        status: 'all',
        page: String(booksPagination.page + 1),
        limit: String(READING_BOOK_PAGE_SIZE),
      });
      if (requestId !== profileBooksRequestIdRef.current) return;
      setBooks((current) => appendUniqueBooks(current, response.items));
      setBooksPagination(response.pagination);
    } catch (requestError) {
      if (requestId === profileBooksRequestIdRef.current) setBooksError(requestError.message);
    } finally {
      if (requestId === profileBooksRequestIdRef.current) setIsLoadingMoreProfileBooks(false);
    }
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    setMessage('');
    setError('');
    try {
      const { user: updatedUser } = await focuserApi.updateProfile({
        name: name.trim(),
        username: username.trim() || null,
        bio: bio.trim() || null,
        currentBookId: currentBookId || null,
        favoriteBookId: favoriteBookId || null,
      });
      setUser(updatedUser);
      setName(updatedUser.name);
      setUsername(updatedUser.username || '');
      setBio(updatedUser.bio || '');
      setCurrentBookId(updatedUser.currentBookId || '');
      setFavoriteBookId(updatedUser.favoriteBookId || '');
      setMessage('Perfil atualizado.');
      onProfileUpdated?.(updatedUser.username);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSaving(false);
    }
  };

  const uploadProfileImage = async (event, type) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const setImageMessage = type === 'banner' ? setBannerMessage : setAvatarMessage;
    const setImageError = type === 'banner' ? setBannerError : setAvatarError;
    setImageMessage('');
    setImageError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setImageError('Escolha uma imagem JPG, PNG ou WebP.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImageError('A imagem deve ter no máximo 5 MB.');
      return;
    }

    setCropRequest({ source: URL.createObjectURL(file), type });
  };

  const uploadCroppedProfileImage = async (croppedImage, type) => {
    const setImageMessage = type === 'banner' ? setBannerMessage : setAvatarMessage;
    const setImageError = type === 'banner' ? setBannerError : setAvatarError;
    const setUploading = type === 'banner' ? setIsUploadingBanner : setIsUploadingAvatar;
    setImageMessage('');
    setImageError('');
    setUploading(true);
    try {
      const signature = type === 'banner'
        ? await focuserApi.bannerUploadSignature()
        : await focuserApi.avatarUploadSignature();
      const formData = new FormData();
      formData.append('file', croppedImage, type === 'banner' ? 'profile-banner.webp' : 'profile-avatar.webp');
      formData.append('api_key', signature.apiKey);
      formData.append('timestamp', String(signature.timestamp));
      formData.append('folder', signature.folder);
      formData.append('signature', signature.signature);
      const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(signature.cloudName)}/image/upload`, {
        method: 'POST',
        body: formData,
      });
      const result = await response.json();
      if (!response.ok || typeof result.secure_url !== 'string') {
        throw new Error(result.error?.message || 'Não foi possível enviar a imagem ao Cloudinary.');
      }
      const field = type === 'banner' ? 'bannerUrl' : 'avatarUrl';
      const { user: updatedUser } = await focuserApi.updateProfile({ [field]: result.secure_url });
      setUser(updatedUser);
      setImageMessage(type === 'banner' ? 'Banner atualizado.' : 'Foto de perfil atualizada.');
      onProfileUpdated?.(updatedUser.username);
    } catch (uploadError) {
      setImageError(uploadError.message);
      throw uploadError;
    } finally {
      setUploading(false);
    }
  };

  const activeBooks = books.filter((book) => book.isActive);

  const selectAccentColor = async (color) => {
    if (isSavingTheme) return;
    setThemeError('');
    setIsSavingTheme(true);
    try {
      await updateAccentColor(color);
      onProfileUpdated?.(user?.username);
    } catch (updateError) {
      setThemeError(updateError.message);
    } finally {
      setIsSavingTheme(false);
    }
  };

  const content = (
    <>
      {embedded ? (
        <div className="profile-customization-heading">
          <div>
            <p className="eyebrow">Personalização</p>
            <h2 id="profile-customization-title">Editar perfil</h2>
            <p className="muted-state">Atualize as informações e a aparência do seu perfil público.</p>
          </div>
          <button type="button" className="icon-button" aria-label="Fechar personalização" onClick={onClose}><X size={19} /></button>
        </div>
      ) : (
        <PageHeader title="Perfil" eyebrow="Personalização" subtitle="Personalize as informações e a aparência do seu perfil público." />
      )}
      <form className="card profile-settings" onSubmit={saveProfile}>
        <div className="profile-settings-section-heading">
          <span className="eyebrow">identidade</span>
          <h3>Seu perfil</h3>
          <p className="muted-state">Escolha como as pessoas verão você na comunidade.</p>
        </div>
        <div className="profile-media-grid">
          <section className="profile-media-card profile-banner-card" aria-label="Banner do perfil">
            <div className="profile-banner-preview">
              {user?.bannerUrl ? <img src={user.bannerUrl} alt="Prévia do banner do perfil" /> : <span>Seu banner</span>}
              <span className="profile-media-overlay">Banner do perfil</span>
            </div>
            <div className="profile-media-card-footer">
              <div className="profile-media-copy">
                <strong>Imagem de capa</strong>
                <small>JPG, PNG ou WebP · até 5 MB</small>
              </div>
              <label className="button button-secondary profile-avatar-button">
                {isUploadingBanner ? 'Enviando…' : user?.bannerUrl ? 'Trocar' : 'Adicionar'}
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => uploadProfileImage(event, 'banner')} disabled={isUploadingBanner} />
              </label>
            </div>
            {bannerMessage ? <p className="success-text" role="status">{bannerMessage}</p> : null}
            {bannerError ? <p className="error-text" role="alert">{bannerError}</p> : null}
          </section>
          <section className="profile-media-card profile-avatar-card" aria-label="Foto do perfil">
            <div className="profile-avatar-preview">
              {user?.avatarUrl ? <img src={user.avatarUrl} alt="Foto do perfil" /> : <User size={30} />}
            </div>
            <div className="profile-media-card-footer">
              <div className="profile-media-copy">
                <strong>Foto de perfil</strong>
                <small>JPG, PNG ou WebP · até 5 MB</small>
              </div>
              <label className="button button-secondary profile-avatar-button">
                {isUploadingAvatar ? 'Enviando…' : 'Trocar'}
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => uploadProfileImage(event, 'avatar')} disabled={isUploadingAvatar} />
              </label>
            </div>
            {avatarMessage ? <p className="success-text" role="status">{avatarMessage}</p> : null}
            {avatarError ? <p className="error-text" role="alert">{avatarError}</p> : null}
          </section>
        </div>
        <div className="profile-settings-section-heading profile-info-heading">
          <span className="eyebrow">informações</span>
          <h3>Detalhes públicos</h3>
        </div>
        <div className="profile-fields-grid">
          <label><span>Nome</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength="80" required /></label>
          <label>
            <span>Nome de usuário</span>
            <div className="profile-username-input"><span aria-hidden="true">@</span><input value={username} onChange={(event) => setUsername(event.target.value.replace(/^@/, '').toLowerCase())} minLength="3" maxLength="30" pattern="[a-zA-Z0-9._]{3,30}" placeholder="seu.usuario" /></div>
            <small className="muted-state">Seu identificador público; use letras, números, pontos ou sublinhados.</small>
          </label>
          <label className="profile-bio-field"><span>Bio</span><textarea value={bio} onChange={(event) => setBio(event.target.value)} maxLength="500" rows="4" placeholder="Conte um pouco sobre você." /><small className="muted-state profile-bio-count">{bio.length}/500 caracteres</small></label>
        </div>
        <div className="profile-settings-section-heading profile-books-heading">
          <span className="eyebrow">leituras</span>
          <h3>Livros no perfil</h3>
          <p className="muted-state">Destaque o que está lendo e escolha seu livro favorito.</p>
        </div>
        <div className="profile-book-pickers">
          <ProfileBookPicker
            id="current-book"
            title="Livro em leitura"
            description="Escolha entre seus livros ativos."
            books={activeBooks}
            value={currentBookId}
            onChange={setCurrentBookId}
            hasMoreBooks={Boolean(booksPagination && booksPagination.page < booksPagination.totalPages)}
            isLoadingMoreBooks={isLoadingMoreProfileBooks}
            isLoadingBooks={isLoadingBooks}
            loadedBookCount={books.length}
            totalBookCount={booksPagination?.total ?? books.length}
            onLoadMoreBooks={loadMoreProfileBooks}
          />
          <ProfileBookPicker
            id="favorite-book"
            title="Livro favorito"
            description="Escolha entre os livros cadastrados na sua conta."
            books={books}
            value={favoriteBookId}
            onChange={setFavoriteBookId}
            hasMoreBooks={Boolean(booksPagination && booksPagination.page < booksPagination.totalPages)}
            isLoadingMoreBooks={isLoadingMoreProfileBooks}
            isLoadingBooks={isLoadingBooks}
            loadedBookCount={books.length}
            totalBookCount={booksPagination?.total ?? books.length}
            onLoadMoreBooks={loadMoreProfileBooks}
          />
        </div>
        {booksError ? <p className="error-text" role="alert">Não foi possível carregar seus livros: {booksError}</p> : null}
        {!booksError && books.length === 0 ? <p className="muted-state">Ainda não há livros cadastrados. <Link to="/app/leituras">Adicione livros na área de leituras.</Link></p> : null}
        <div className="profile-save-footer">
          <div>
            {message ? <p className="success-text" role="status">{message}</p> : <small>As alterações ficam visíveis no seu perfil público.</small>}
            {error ? <p className="error-text" role="alert">{error}</p> : null}
          </div>
          <button type="submit" className="button button-primary" disabled={isSaving}>{isSaving ? 'Salvando…' : 'Salvar perfil'}</button>
        </div>
      </form>
      <section className="card theme-settings" aria-labelledby="accent-color-heading">
        <div className="profile-settings-section-heading">
          <span className="eyebrow">aparência</span>
          <h3 id="accent-color-heading">Cor do perfil público</h3>
          <p className="muted-state">Escolha a cor exibida no seu perfil público. A cor do aplicativo é configurada em Aparência.</p>
        </div>
        <div className="accent-options" role="group" aria-label="Escolha a cor do perfil público">
          {APP_ACCENT_PRESETS.map((color) => (
            <button
              type="button"
              key={color.value}
              className={`accent-option ${profileAccentColor === color.value ? 'selected' : ''}`}
              style={{ '--swatch-color': color.value }}
              aria-label={color.label}
              aria-pressed={profileAccentColor === color.value}
              disabled={isSavingTheme}
              onClick={() => selectAccentColor(color.value)}
            >
              <span />
              <small>{color.label}</small>
            </button>
          ))}
        </div>
        <label className="custom-accent-picker" htmlFor="custom-accent-color">
          <span className="custom-accent-swatch" style={{ '--swatch-color': profileAccentColor }} aria-hidden="true" />
          <span><strong>Cor personalizada</strong><small>{profileAccentColor.toUpperCase()}</small></span>
          <input
            id="custom-accent-color"
            className="accent-color-input"
            type="color"
            value={profileAccentColor}
            aria-label="Escolher cor de destaque personalizada"
            disabled={isSavingTheme}
            onChange={(event) => selectAccentColor(event.target.value)}
          />
        </label>
        {isSavingTheme ? <p className="muted-state" role="status">Salvando preferência…</p> : null}
        {themeError ? <p className="error-text" role="alert">{themeError}</p> : null}
      </section>
      {cropRequest ? (
        <ProfileImageCropper
          source={cropRequest.source}
          type={cropRequest.type}
          onCancel={closeCropEditor}
          onApply={(croppedImage) => uploadCroppedProfileImage(croppedImage, cropRequest.type)}
        />
      ) : null}
    </>
  );
  return embedded
    ? <div className="profile-customization-content">{content}</div>
    : <AppLayout>{content}</AppLayout>;
}
